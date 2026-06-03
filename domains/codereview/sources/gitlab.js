// GitLab data source — set GITLAB_PROJECT (and GITLAB_TOKEN) in .env.
//
// Works with GitLab.com and self-managed instances (GitLab EE in organizations).
//
//   GITLAB_PROJECT=group/project   or numeric project id
//   GITLAB_TOKEN=glpat-xxx         required for private projects / higher rate limits
//   GITLAB_MR=42                   optional: single merge request (internal IID)
//   GITLAB_MAX_MRS=15
//   GITLAB_API=https://gitlab.com/api/v4   (self-hosted: https://gitlab.yourco.com/api/v4)
//
// Optional repo-level config (same as GitHub):
//   .reviewgraph.json  — ADRs, forbidden dependencies, security globs
//   CODEOWNERS / .gitlab/CODEOWNERS — ownership for reviewer recommendation

import { AI_RE, buildDatasetFromMergeRequests, parseCodeowners } from "./shared.js";
import { fetchReviewgraphRules, mergeRulesFromPrFiles } from "./reviewgraphConfig.js";
import { buildRepoSnapshotDataset, fetchGitlabRepoFilePaths } from "./repoSnapshot.js";

const API = (process.env.GITLAB_API || "https://gitlab.com/api/v4").replace(/\/$/, "");

function projectPath(project) {
  return encodeURIComponent(project);
}

function glHeaders() {
  const headers = { "User-Agent": "ReviewGraph-AI" };
  if (process.env.GITLAB_TOKEN) headers["PRIVATE-TOKEN"] = process.env.GITLAB_TOKEN;
  return headers;
}

async function gl(pathname, searchParams) {
  const url = new URL(`${API}${pathname}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: glHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitLab ${res.status} ${res.statusText} for ${pathname}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }
  return res.json();
}

async function glRawFile(project, filePath, ref) {
  try {
    const url = `${API}/projects/${projectPath(project)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: glHeaders() });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

function mrState(mr) {
  if (mr.state === "merged" || mr.merged_at) return "merged";
  if (mr.state === "closed") return "closed";
  return "open";
}

function countDiffStats(diff) {
  if (!diff) return { additions: 0, deletions: 0 };
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

export async function loadGitlabDataset() {
  const project = process.env.GITLAB_PROJECT;
  if (!project) throw new Error('GITLAB_PROJECT must be set (e.g. "group/project" or numeric id).');

  const onlyMr = process.env.GITLAB_MR;
  const maxMrs = Math.max(1, Number(process.env.GITLAB_MAX_MRS || 15));
  const pid = projectPath(project);

  const projectInfo = await gl(`/projects/${pid}`);
  const defaultRef = projectInfo.default_branch || "main";

  const rules = await fetchReviewgraphRules((path) => glRawFile(project, path, defaultRef));

  const coText =
    (await glRawFile(project, "CODEOWNERS", defaultRef)) ||
    (await glRawFile(project, ".gitlab/CODEOWNERS", defaultRef)) ||
    (await glRawFile(project, "docs/CODEOWNERS", defaultRef));
  const codeowners = coText ? parseCodeowners(coText) : [];

  const mrList = onlyMr
    ? [await gl(`/projects/${pid}/merge_requests/${onlyMr}`)]
    : await gl(`/projects/${pid}/merge_requests`, {
        state: "all",
        per_page: maxMrs,
        order_by: "updated_at",
        sort: "desc"
      });

  const mergeRequests = [];
  for (const mrSummary of (Array.isArray(mrList) ? mrList : []).slice(0, maxMrs)) {
    const iid = mrSummary.iid;
    const [changesPayload, notes] = await Promise.all([
      gl(`/projects/${pid}/merge_requests/${iid}/changes`).catch(() => ({ changes: [] })),
      gl(`/projects/${pid}/merge_requests/${iid}/notes`, { per_page: 100, sort: "desc" }).catch(() => [])
    ]);

    const changes = changesPayload.changes || [];
    const aiHaystack = `${mrSummary.title || ""} ${mrSummary.description || ""}`;

    const fileComments = [];
    const reviewerLogins = new Set();

    for (const note of notes) {
      if (note.author?.username) reviewerLogins.add(note.author.username);
      const path = note.position?.new_path || note.position?.old_path;
      if (path && !note.system) {
        fileComments.push({
          id: note.id,
          login: note.author?.username,
          path,
          body: note.body
        });
      }
    }

    mergeRequests.push({
      iid,
      title: mrSummary.title,
      body: mrSummary.description,
      state: mrState(mrSummary),
      authorLogin: mrSummary.author?.username,
      isAiAssisted: AI_RE.test(aiHaystack),
      files: changes.map((ch) => {
        const path = ch.new_path || ch.old_path;
        const stats = countDiffStats(ch.diff);
        return { path, patch: ch.diff, additions: stats.additions, deletions: stats.deletions };
      }),
      comments: fileComments,
      reviewerLogins: [...reviewerLogins]
    });
  }

  const repoMeta = {
    name: projectInfo.path_with_namespace || projectInfo.name,
    url: projectInfo.web_url,
    primaryLanguage: null
  };

  if (mergeRequests.length === 0) {
    const files = await fetchGitlabRepoFilePaths(project, pid, gl, defaultRef);
    return buildRepoSnapshotDataset({ repo: repoMeta, files, rules, codeowners, platform: "gitlab" });
  }

  const mergedRules = mergeRulesFromPrFiles(rules, mergeRequests);

  return buildDatasetFromMergeRequests({
    repo: repoMeta,
    rules: mergedRules,
    codeowners,
    flagshipMrIid: onlyMr || null,
    mergeRequests
  });
}
