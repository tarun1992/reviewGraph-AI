// Generic fallback when a repo has no merge/pull requests yet: build one review
// entity from the default-branch file tree so the UI and Aura Agent still work.

import { buildDatasetFromMergeRequests } from "./shared.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "__pycache__",
  ".venv",
  "coverage",
  "target"
]);

const CODE_EXT = /\.(py|js|jsx|ts|tsx|go|java|rb|rs|swift|kt|c|cpp|h|hpp|cs|php|md|json|yaml|yml|toml|sh|sql|cypher)$/i;

function isReviewablePath(path) {
  const base = path.split("/").pop() || "";
  if (base.startsWith(".")) return false;
  return CODE_EXT.test(path);
}

/**
 * GitHub: walk /contents API (depth-limited).
 */
export async function fetchGithubRepoFilePaths(repo, gh) {
  const paths = [];

  async function walk(dir) {
    if (paths.length >= 30) return;
    const segment = dir ? `/repos/${repo}/contents/${dir}` : `/repos/${repo}/contents`;
    let items;
    try {
      items = await gh(segment);
    } catch {
      return;
    }
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (paths.length >= 30) break;
      if (item.type === "file" && isReviewablePath(item.path)) {
        paths.push({ path: item.path, patch: "", additions: 1, deletions: 0 });
      }
      if (item.type === "dir") {
        const name = item.path.split("/").pop();
        if (!SKIP_DIRS.has(name)) await walk(item.path);
      }
    }
  }

  await walk("");
  return paths;
}

/**
 * GitLab: repository tree API (flat, depth 5).
 */
export async function fetchGitlabRepoFilePaths(project, pid, gl, defaultRef) {
  const tree = await gl(`/projects/${pid}/repository/tree`, {
    recursive: true,
    per_page: 100,
    ref: defaultRef
  }).catch(() => []);

  return (Array.isArray(tree) ? tree : [])
    .filter((e) => e.type === "blob" && isReviewablePath(e.path))
    .slice(0, 30)
    .map((e) => ({ path: e.path, patch: "", additions: 1, deletions: 0 }));
}

/**
 * One synthetic PR for any repository with no open MRs/PRs.
 */
export function buildRepoSnapshotDataset({ repo, files, rules, codeowners, platform = "git" }) {
  const fileList = files?.length ? files : [{ path: "README.md", patch: "", additions: 1, deletions: 0 }];

  console.log(
    `[ReviewGraph] No ${platform === "gitlab" ? "merge requests" : "pull requests"} found — using repository snapshot (${fileList.length} paths). Open a real PR to replace this.`
  );

  return buildDatasetFromMergeRequests({
    repo,
    rules,
    codeowners,
    flagshipMrIid: "snapshot",
    mergeRequests: [
      {
        iid: "snapshot",
        title: `Repository snapshot — ${repo.name} (no ${platform === "gitlab" ? "MRs" : "PRs"} yet)`,
        body: `ReviewGraph built this from the default branch file tree because the repository has no pull/merge requests to ingest. Configure ${platform === "gitlab" ? "GITLAB_PROJECT" : "GITHUB_REPO"} only — no code changes required.`,
        state: "open",
        authorLogin: "reviewgraph",
        isAiAssisted: false,
        files: fileList,
        comments: [],
        reviewerLogins: []
      }
    ]
  });
}
