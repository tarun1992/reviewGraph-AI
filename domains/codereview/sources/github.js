// GitHub data source — configure via .env only (no code changes per repo).
//
//   GITHUB_REPO=owner/name
//   GITHUB_TOKEN=ghp_xxx          # recommended: rate limits + private repos
//   GITHUB_PR=512                 # optional: single PR
//   GITHUB_MAX_PRS=15
//   GITHUB_API=https://api.github.com

import { AI_RE, buildDatasetFromMergeRequests, parseCodeowners } from "./shared.js";
import {
  fetchReviewgraphRules,
  mergeRulesFromPrFiles,
  REVIEWGRAPH_CONFIG_PATHS
} from "./reviewgraphConfig.js";
import { buildRepoSnapshotDataset, fetchGithubRepoFilePaths } from "./repoSnapshot.js";

const API = (process.env.GITHUB_API || "https://api.github.com").replace(/\/$/, "");

async function gh(pathname) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "ReviewGraph-AI" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${API}${pathname}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${res.statusText} for ${pathname}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }
  return res.json();
}

async function ghContent(repo, path, ref) {
  try {
    const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const encodedPath = String(path)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const data = await gh(`/repos/${repo}/contents/${encodedPath}${refQ}`);
    if (data?.content) return Buffer.from(data.content, data.encoding || "base64").toString("utf8");
  } catch {
    /* not found */
  }
  return null;
}

/** GitHub truncates large JSON in pull file patches — load full config from the PR head branch. */
async function attachConfigFileContents(repo, mergeRequests) {
  for (const mr of mergeRequests) {
    const ref = mr.headRef;
    if (!ref) continue;
    for (const file of mr.files || []) {
      if (
        !file.path ||
        (!REVIEWGRAPH_CONFIG_PATHS.includes(file.path) && !file.path.endsWith("reviewgraph-config.json"))
      ) {
        continue;
      }
      const full = await ghContent(repo, file.path, ref);
      if (full) file.content = full;
    }
  }
}

export async function loadGithubDataset() {
  const repo = process.env.GITHUB_REPO;
  if (!repo?.includes("/")) throw new Error('GITHUB_REPO must be set as "owner/name".');

  const onlyPr = process.env.GITHUB_PR;
  const maxPrs = Math.max(1, Number(process.env.GITHUB_MAX_PRS || 15));

  const repoInfo = await gh(`/repos/${repo}`);
  const rules = await fetchReviewgraphRules((path) => ghContent(repo, path));

  const coText =
    (await ghContent(repo, ".github/CODEOWNERS")) ||
    (await ghContent(repo, "CODEOWNERS")) ||
    (await ghContent(repo, "docs/CODEOWNERS"));
  const codeowners = coText ? parseCodeowners(coText) : [];

  const prList = onlyPr
    ? [await gh(`/repos/${repo}/pulls/${onlyPr}`)]
    : await gh(`/repos/${repo}/pulls?state=all&per_page=${maxPrs}&sort=updated&direction=desc`);

  const mergeRequests = [];
  for (const prSummary of (Array.isArray(prList) ? prList : []).slice(0, maxPrs)) {
    const number = prSummary.number;
    const [prFilesRaw, reviews, comments] = await Promise.all([
      gh(`/repos/${repo}/pulls/${number}/files?per_page=100`).catch(() => []),
      gh(`/repos/${repo}/pulls/${number}/reviews?per_page=100`).catch(() => []),
      gh(`/repos/${repo}/pulls/${number}/comments?per_page=100`).catch(() => [])
    ]);

    const aiHaystack = `${prSummary.title || ""} ${prSummary.body || ""} ${(prSummary.labels || []).map((l) => l.name).join(" ")} ${prSummary.head?.ref || ""}`;

    mergeRequests.push({
      iid: number,
      title: prSummary.title,
      body: prSummary.body,
      state: prSummary.merged_at ? "merged" : prSummary.state || "open",
      authorLogin: prSummary.user?.login,
      headRef: prSummary.head?.ref,
      isAiAssisted: AI_RE.test(aiHaystack),
      labels: (prSummary.labels || []).map((l) => l.name),
      files: prFilesRaw.map((f) => ({
        path: f.filename,
        patch: f.patch,
        additions: f.additions,
        deletions: f.deletions
      })),
      comments: comments
        .filter((c) => c.path)
        .map((c) => ({ id: c.id, login: c.user?.login, path: c.path, body: c.body })),
      reviewerLogins: [...new Set(reviews.map((r) => r.user?.login).filter(Boolean))]
    });
  }

  const repoMeta = {
    name: repoInfo.full_name,
    url: repoInfo.html_url,
    primaryLanguage: repoInfo.language
  };

  if (mergeRequests.length === 0) {
    const files = await fetchGithubRepoFilePaths(repo, gh);
    return buildRepoSnapshotDataset({ repo: repoMeta, files, rules, codeowners, platform: "github" });
  }

  await attachConfigFileContents(repo, mergeRequests);

  let mergedRules = mergeRulesFromPrFiles(rules, mergeRequests);
  for (const mr of mergeRequests) {
    if (!mr.headRef) continue;
    for (const configPath of REVIEWGRAPH_CONFIG_PATHS) {
      const fromHead = await ghContent(repo, configPath, mr.headRef);
      if (fromHead) {
        mergedRules = mergeRulesFromPrFiles(mergedRules, [
          { files: [{ path: configPath, content: fromHead }] }
        ]);
      }
    }
  }

  return buildDatasetFromMergeRequests({
    repo: repoMeta,
    rules: mergedRules,
    codeowners,
    flagshipMrIid: onlyPr || null,
    mergeRequests
  });
}
