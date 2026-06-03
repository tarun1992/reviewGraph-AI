import { normalizeReviewgraphRules, parseReviewgraphJson } from "./shared.js";

export const REVIEWGRAPH_CONFIG_PATHS = [
  ".reviewgraph.json",
  "docs/reviewgraph-config.json",
  ".github/reviewgraph.json"
];

function isConfigPath(path) {
  return REVIEWGRAPH_CONFIG_PATHS.includes(path) || String(path).endsWith("reviewgraph-config.json");
}

/** Extract added lines from a unified diff (new file). */
export function patchToAddedText(patch) {
  if (!patch) return "";
  return patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

/** Merge rules from reviewgraph config files added/changed in open PRs. */
export function mergeRulesFromPrFiles(rules, mergeRequests = []) {
  let merged = { ...rules };
  for (const mr of mergeRequests) {
    for (const file of mr.files || []) {
      const path = file.path || file.filename;
      if (!path || !isConfigPath(path)) continue;
      const text = file.content || patchToAddedText(file.patch);
      if (!text?.trim()) continue;
      try {
        const parsed = parseReviewgraphJson(text);
        merged = normalizeReviewgraphRules({
          ...merged,
          ...parsed,
          incidents: [...(merged.incidents || []), ...(parsed.incidents || [])],
          lessons: [...(merged.lessons || []), ...(parsed.lessons || [])],
          decisions: [...(merged.decisions || []), ...(parsed.decisions || [])],
          adrs: [...(merged.adrs || []), ...(parsed.adrs || [])],
          priorPullRequests: [...(merged.priorPullRequests || []), ...(parsed.priorPullRequests || [])],
          riskPatterns: [...(merged.riskPatterns || []), ...(parsed.riskPatterns || [])],
          securityGlobs: [...new Set([...(merged.securityGlobs || []), ...(parsed.securityGlobs || [])])]
        });
      } catch {
        /* skip invalid config chunk */
      }
    }
  }
  return normalizeReviewgraphRules(merged);
}

/** Load repo-level rules from the first config file found (GitHub/GitLab adapters). */
export async function fetchReviewgraphRules(fetchFile) {
  for (const path of REVIEWGRAPH_CONFIG_PATHS) {
    const text = await fetchFile(path);
    const rules = parseReviewgraphJson(text);
    if (text && Object.keys(rules).length) return rules;
  }
  return {};
}
