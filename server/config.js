import "./loadEnv.js";

/** Resolved VCS source: demo | github | gitlab */
export function getConfiguredSource() {
  const explicit = process.env.SOURCE?.toLowerCase()?.trim();
  if (explicit === "demo" || explicit === "github" || explicit === "gitlab") return explicit;
  if (process.env.GITHUB_REPO?.includes("/")) return "github";
  if (process.env.GITLAB_PROJECT?.trim()) return "gitlab";
  return "demo";
}

export function isExplicitSource() {
  const explicit = process.env.SOURCE?.toLowerCase()?.trim();
  return explicit === "github" || explicit === "gitlab" || explicit === "demo";
}

/** When user set SOURCE=github|gitlab, do not silently fall back to demo data. */
export function shouldFallbackToDemo() {
  if (process.env.SOURCE_FALLBACK === "false") return false;
  const explicit = process.env.SOURCE?.toLowerCase()?.trim();
  if (explicit === "github" || explicit === "gitlab") return false;
  return true;
}

export function getRepositoryLabel() {
  if (getConfiguredSource() === "github") return process.env.GITHUB_REPO;
  if (getConfiguredSource() === "gitlab") return process.env.GITLAB_PROJECT;
  return null;
}

export function isAutoSyncNeo4jEnabled() {
  return process.env.AUTO_SYNC_NEO4J !== "false";
}
