// GitHub data source — set GITHUB_REPO (and optionally GITHUB_TOKEN) in .env.
//
//   GITHUB_REPO=owner/name
//   GITHUB_TOKEN=ghp_xxx
//   GITHUB_PR=512              optional: single PR
//   GITHUB_MAX_PRS=15
//   GITHUB_API=https://api.github.com   (GitHub Enterprise)

import {
  AI_RE,
  buildDatasetFromMergeRequests,
  parseCodeowners,
  parseReviewgraphJson
} from "./shared.js";

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

async function ghContent(repo, path) {
  try {
    const data = await gh(`/repos/${repo}/contents/${path}`);
    if (data?.content) return Buffer.from(data.content, data.encoding || "base64").toString("utf8");
  } catch {
    /* not found */
  }
  return null;
}

export async function loadGithubDataset() {
  const repo = process.env.GITHUB_REPO;
  if (!repo?.includes("/")) throw new Error('GITHUB_REPO must be set as "owner/name".');

  const onlyPr = process.env.GITHUB_PR;
  const maxPrs = Math.max(1, Number(process.env.GITHUB_MAX_PRS || 15));

  const repoInfo = await gh(`/repos/${repo}`);
  const rules = parseReviewgraphJson(await ghContent(repo, ".reviewgraph.json"));

  const coText =
    (await ghContent(repo, ".github/CODEOWNERS")) ||
    (await ghContent(repo, "CODEOWNERS")) ||
    (await ghContent(repo, "docs/CODEOWNERS"));
  const codeowners = coText ? parseCodeowners(coText) : [];

  const prList = onlyPr
    ? [await gh(`/repos/${repo}/pulls/${onlyPr}`)]
    : await gh(`/repos/${repo}/pulls?state=all&per_page=${maxPrs}&sort=updated&direction=desc`);

  const mergeRequests = [];
  for (const prSummary of prList.slice(0, maxPrs)) {
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

  return buildDatasetFromMergeRequests({
    repo: { name: repoInfo.full_name, url: repoInfo.html_url, primaryLanguage: repoInfo.language },
    rules,
    codeowners,
    flagshipMrIid: onlyPr || null,
    mergeRequests
  });
}
