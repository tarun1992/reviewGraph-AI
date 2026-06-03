// ReviewGraph AI world model — a pluggable in-memory store.
//
// The model holds the canonical Code Intelligence Graph (Layer 1), operations
// & org data (Layer 2), and agent memory (Layer 3). The data itself comes from
// a swappable *source*:
//   - sources/demo.js   — the built-in synthetic org (SOURCE=demo, default)
//   - sources/github.js — GitHub repository (GITHUB_REPO)
//   - sources/gitlab.js — GitLab project (GITLAB_PROJECT, self-hosted via GITLAB_API)
//
// `applyDataset()` swaps in a new dataset and rebuilds the indexes; selectors
// read live module bindings, so the rest of the engine (assess, questions,
// present) keeps working unchanged regardless of where the data came from.

import { demoDataset } from "./sources/demo.js";
import { getConfiguredSource, shouldFallbackToDemo } from "../../server/config.js";

// Live bindings — reassigned by applyDataset(). Importers see the latest data.
export let repositories = [];
export let teams = [];
export let developers = [];
export let services = [];
export let modules = [];
export let moduleDeps = [];
export let files = [];
export let issueTypes = [];
export let riskPatterns = [];
export let pullRequests = [];
export let reviewComments = [];
export let aiChanges = [];
export let securityFindings = [];
export let releases = [];
export let deployments = [];
export let incidents = [];
export let adrs = [];
export let decisions = [];
export let lessons = [];

export let index = emptyIndex();
let flagshipEntityId = null;
let activeSource = "demo";

const byId = (list) => new Map(list.map((item) => [item.id, item]));

function emptyIndex() {
  return {
    repositories: new Map(), teams: new Map(), developers: new Map(), services: new Map(),
    modules: new Map(), files: new Map(), issueTypes: new Map(), riskPatterns: new Map(),
    pullRequests: new Map(), reviewComments: new Map(), aiChanges: new Map(), incidents: new Map(),
    adrs: new Map(), decisions: new Map(), lessons: new Map(), securityFindings: new Map()
  };
}

// Replace the active dataset and rebuild indexes. Missing collections default
// to empty arrays so a partial dataset (e.g. a fresh repo with no incidents or
// ADRs yet) still works.
export function applyDataset(dataset = {}) {
  repositories = dataset.repositories || [];
  teams = dataset.teams || [];
  developers = dataset.developers || [];
  services = dataset.services || [];
  modules = dataset.modules || [];
  moduleDeps = dataset.moduleDeps || [];
  files = dataset.files || [];
  issueTypes = dataset.issueTypes || [];
  riskPatterns = dataset.riskPatterns || [];
  pullRequests = dataset.pullRequests || [];
  reviewComments = dataset.reviewComments || [];
  aiChanges = dataset.aiChanges || [];
  securityFindings = dataset.securityFindings || [];
  releases = dataset.releases || [];
  deployments = dataset.deployments || [];
  incidents = dataset.incidents || [];
  adrs = dataset.adrs || [];
  decisions = dataset.decisions || [];
  lessons = dataset.lessons || [];

  index = {
    repositories: byId(repositories),
    teams: byId(teams),
    developers: byId(developers),
    services: byId(services),
    modules: byId(modules),
    files: byId(files),
    issueTypes: byId(issueTypes),
    riskPatterns: byId(riskPatterns),
    pullRequests: byId(pullRequests),
    reviewComments: byId(reviewComments),
    aiChanges: byId(aiChanges),
    incidents: byId(incidents),
    adrs: byId(adrs),
    decisions: byId(decisions),
    lessons: byId(lessons),
    securityFindings: byId(securityFindings)
  };

  flagshipEntityId = dataset.flagshipEntityId || pullRequests[0]?.id || null;
}

export function getFlagshipEntityId() {
  return flagshipEntityId;
}

export function getActiveSource() {
  return activeSource;
}

/** Resolve SOURCE from .env (see server/config.js). */
export function resolveSource() {
  return getConfiguredSource();
}

function formatSourceError(platform, error) {
  let message = error?.message || String(error);
  if (/rate limit/i.test(message) && platform === "github" && !process.env.GITHUB_TOKEN) {
    message += " — set GITHUB_TOKEN in .env (fine-grained or classic PAT).";
  }
  if (/401|403/.test(message) && platform === "gitlab" && !process.env.GITLAB_TOKEN) {
    message += " — set GITLAB_TOKEN in .env for private or self-hosted GitLab.";
  }
  return message;
}

// Initialize the model from the configured source. Called once at startup by
// the pack (server, seed, dataset runners). Falls back to the demo dataset if
// a live source fails, so the app always boots.
export async function initModel() {
  const source = resolveSource();

  if (source === "github") {
    try {
      const { loadGithubDataset } = await import("./sources/github.js");
      const dataset = await loadGithubDataset();
      applyDataset(dataset);
      activeSource = "github";
      const flagship = getFlagshipEntityId();
      if (flagship) {
        const { assessPullRequest } = await import("./assess.js");
        const smoke = assessPullRequest(flagship);
        console.log(
          `[ReviewGraph] ingest rules: ${decisions.length} decisions, ${incidents.length} incidents · ${flagship} score=${smoke?.score ?? "?"} (${smoke?.evidence?.length ?? 0} evidence)`
        );
      }
      return { source: "github", repo: process.env.GITHUB_REPO, entities: pullRequests.length };
    } catch (error) {
      const message = formatSourceError("github", error);
      console.error(`[ReviewGraph] GitHub source failed (${message})`);
      if (shouldFallbackToDemo()) {
        applyDataset(demoDataset);
        activeSource = "demo";
        return { source: "demo", error: message, entities: pullRequests.length };
      }
      applyDataset({ repositories: [], pullRequests: [], flagshipEntityId: null });
      activeSource = "github";
      return { source: "github", error: message, entities: 0, repo: process.env.GITHUB_REPO };
    }
  }

  if (source === "gitlab") {
    try {
      const { loadGitlabDataset } = await import("./sources/gitlab.js");
      const dataset = await loadGitlabDataset();
      applyDataset(dataset);
      activeSource = "gitlab";
      return { source: "gitlab", project: process.env.GITLAB_PROJECT, entities: pullRequests.length };
    } catch (error) {
      const message = formatSourceError("gitlab", error);
      console.error(`[ReviewGraph] GitLab source failed (${message})`);
      if (shouldFallbackToDemo()) {
        applyDataset(demoDataset);
        activeSource = "demo";
        return { source: "demo", error: message, entities: pullRequests.length };
      }
      applyDataset({ repositories: [], pullRequests: [], flagshipEntityId: null });
      activeSource = "gitlab";
      return { source: "gitlab", error: message, entities: 0, project: process.env.GITLAB_PROJECT };
    }
  }

  applyDataset(demoDataset);
  activeSource = "demo";
  return { source: "demo", entities: pullRequests.length };
}

// Load the demo dataset synchronously so importing the model (e.g. in tests or
// the deck builder) works before initModel() runs.
applyDataset(demoDataset);

// ---------------------------------------------------------------------------
// Derived indexes and selectors
// ---------------------------------------------------------------------------

export function getService(id) {
  return index.services.get(id);
}

export function moduleService(moduleId) {
  const module = index.modules.get(moduleId);
  return module ? index.services.get(module.serviceId) : undefined;
}

export function teamForService(serviceId) {
  const service = index.services.get(serviceId);
  return service ? index.teams.get(service.teamId) : undefined;
}

// Find all dependency cycles among modules (paths up to maxLen) using DFS.
export function findModuleCycles(maxLen = 5) {
  const adjacency = new Map(modules.map((m) => [m.id, []]));
  for (const dep of moduleDeps) {
    adjacency.get(dep.source)?.push(dep.target);
  }

  const cycles = [];
  const seen = new Set();

  function dfs(start, current, path) {
    if (path.length > maxLen) return;
    for (const next of adjacency.get(current) || []) {
      if (next === start && path.length >= 2) {
        const names = path.map((id) => index.modules.get(id).name);
        const key = [...names].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ length: path.length, modules: names });
        }
      } else if (!path.includes(next)) {
        dfs(start, next, [...path, next]);
      }
    }
  }

  for (const module of modules) {
    dfs(module.id, module.id, [module.id]);
  }

  return cycles.sort((a, b) => a.length - b.length);
}

export function prFiles(prId) {
  const pr = index.pullRequests.get(prId);
  if (!pr) return [];
  return pr.files.map((fileId) => index.files.get(fileId)).filter(Boolean);
}

export function prModules(prId) {
  const moduleIds = new Set(prFiles(prId).map((file) => file.moduleId));
  return [...moduleIds].map((id) => index.modules.get(id)).filter(Boolean);
}

export function prServices(prId) {
  const serviceIds = new Set(prModules(prId).map((module) => module.serviceId));
  return [...serviceIds].map((id) => index.services.get(id)).filter(Boolean);
}

export function prAiChanges(prId) {
  return aiChanges.filter((change) => change.prId === prId);
}

export function prComments(prId) {
  return reviewComments.filter((comment) => comment.prId === prId);
}

export function patternsForPr(prId) {
  const result = new Map();
  for (const change of prAiChanges(prId)) {
    for (const { patternId, score } of change.patterns) {
      const pattern = index.riskPatterns.get(patternId);
      if (pattern) result.set(patternId, { pattern, score });
    }
  }
  return [...result.values()];
}

// Naive lexical similarity for the in-memory fallback. The Neo4j path uses
// real vector indexes (see scripts/createVectorIndexes.js).
export function lexicalSimilarity(a, b) {
  const tokenize = (text) =>
    new Set(String(text || "").toLowerCase().match(/[a-z0-9]+/g) || []);
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

// ---------------------------------------------------------------------------
// Aura Agent feature selectors (reviewer recommendation, risk propagation,
// architectural compliance)
// ---------------------------------------------------------------------------

// Services whose modules depend on a module inside the given service.
export function serviceConsumers(serviceId) {
  const targetModuleIds = new Set(modules.filter((m) => m.serviceId === serviceId).map((m) => m.id));
  const consumerServiceIds = new Set();
  for (const dep of moduleDeps) {
    if (targetModuleIds.has(dep.target)) {
      const sourceModule = index.modules.get(dep.source);
      if (sourceModule && sourceModule.serviceId !== serviceId) consumerServiceIds.add(sourceModule.serviceId);
    }
  }
  return [...consumerServiceIds].map((id) => index.services.get(id)).filter(Boolean);
}

// Risk propagation: services downstream that could break if this PR merges.
export function prDownstreamServices(prId) {
  const touched = new Set(prServices(prId).map((s) => s.id));
  const downstream = new Map();
  for (const serviceId of touched) {
    for (const consumer of serviceConsumers(serviceId)) {
      if (!touched.has(consumer.id)) downstream.set(consumer.id, consumer);
    }
  }
  return [...downstream.values()];
}

// Developers who previously reviewed the files this PR touches.
export function historicalReviewers(prId) {
  const fileIds = new Set(prFiles(prId).map((f) => f.id));
  const counts = new Map();
  for (const c of reviewComments) {
    if (c.prId !== prId && fileIds.has(c.fileId)) {
      counts.set(c.reviewerId, (counts.get(c.reviewerId) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, n]) => ({ developer: index.developers.get(id), reviews: n }))
    .filter((x) => x.developer);
}

// Reviewer recommendation: rank developers by ownership, history, and security need.
export function recommendReviewers(prId) {
  const pr = index.pullRequests.get(prId);
  if (!pr) return [];
  const scores = new Map();
  const add = (devId, weight, reason) => {
    if (!devId || devId === pr.authorId) return;
    const dev = index.developers.get(devId);
    if (!dev) return;
    const entry = scores.get(devId) || { developer: dev, score: 0, reasons: [] };
    entry.score += weight;
    entry.reasons.push(reason);
    scores.set(devId, entry);
  };

  for (const service of prServices(prId)) {
    const team = teamForService(service.id);
    if (!team) continue;
    for (const dev of developers) {
      if (dev.teamId === team.id) add(dev.id, 2, `owns ${service.name}`);
    }
  }
  for (const { developer, reviews } of historicalReviewers(prId)) {
    add(developer.id, 3 + reviews, `reviewed these files before (${reviews}x)`);
  }
  if (prFiles(prId).some((f) => f.securitySensitive)) {
    const sec = developers.find((d) => d.login === "security-reviewer");
    if (sec) add(sec.id, 4, "security-sensitive change");
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

// Architectural compliance: decisions/ADRs this PR violates.
export function complianceViolations(prId) {
  const violations = [];
  for (const file of prFiles(prId)) {
    const dep = file.introducesDependency;
    if (!dep) continue;
    for (const decision of decisions) {
      const f = decision.forbids;
      if (f && f.fromServiceId === dep.fromServiceId && f.toServiceId === dep.toServiceId) {
        violations.push({
          decision,
          adr: index.adrs.get(decision.adrId),
          file,
          from: index.services.get(dep.fromServiceId),
          to: index.services.get(dep.toServiceId)
        });
      }
    }
  }
  return violations;
}
