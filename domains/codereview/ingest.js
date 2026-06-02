// Produces canonical CSV tables for Aura LOAD CSV import, derived from the
// code-review world model. Pairs with import.cypher.

import path from "node:path";
import * as model from "./model.js";

export const headers = {
  repositories: ["id", "name", "url", "primaryLanguage"],
  teams: ["id", "name", "domain"],
  developers: ["id", "name", "login", "teamId"],
  services: ["id", "name", "criticality", "teamId"],
  modules: ["id", "repoId", "name", "layer", "serviceId"],
  files: ["id", "repoId", "path", "moduleId", "extension", "securitySensitive"],
  pull_requests: ["id", "repoId", "number", "title", "authorId", "state", "isAiAssisted", "baseRiskScore", "summary"],
  review_comments: ["id", "prId", "reviewerId", "fileId", "issueTypeId", "sentiment", "body", "embeddingText"],
  issue_types: ["id", "name", "severity", "description"],
  risk_patterns: ["id", "name", "severity", "description", "embeddingText"],
  ai_changes: ["id", "prId", "fileId", "summary", "embeddingText"],
  security_findings: ["id", "prId", "fileId", "severity", "title", "description"],
  releases: ["id", "name"],
  deployments: ["id", "releaseId", "serviceId", "environment", "outcome"],
  incidents: ["id", "title", "severity", "rootCause", "summary", "tracedToPr"],
  adrs: ["id", "title", "status", "governsServiceId"],
  decisions: ["id", "summary", "policy", "status", "aboutServiceId", "adrId"],
  lessons: ["id", "statement", "recommends", "fromIncident"],
  rel_module_deps: ["source", "target", "reason", "regression"],
  rel_pr_files: ["prId", "fileId"],
  rel_comment_issues: ["commentId", "issueTypeId"],
  rel_pattern_issues: ["patternId", "issueTypeId"],
  rel_ai_patterns: ["aiChangeId", "patternId", "score"],
  rel_incident_services: ["incidentId", "serviceId"],
  rel_release_prs: ["releaseId", "prId"],
  rel_lesson_modules: ["lessonId", "moduleId"],
  rel_lesson_patterns: ["lessonId", "patternId"]
};

export function ingest() {
  const repoId = model.repositories[0].id;
  const tables = Object.fromEntries(Object.keys(headers).map((k) => [k, []]));

  tables.repositories = model.repositories.map((r) => ({ ...r }));
  tables.teams = model.teams.map((t) => ({ ...t }));
  tables.developers = model.developers.map((d) => ({ ...d }));
  tables.services = model.services.map((s) => ({ ...s }));
  tables.modules = model.modules.map((m) => ({ id: m.id, repoId, name: m.name, layer: m.layer, serviceId: m.serviceId }));
  tables.files = model.files.map((f) => ({ id: f.id, repoId, path: f.path, moduleId: f.moduleId, extension: path.extname(f.path).replace(".", ""), securitySensitive: String(Boolean(f.securitySensitive)) }));
  tables.issue_types = model.issueTypes.map((i) => ({ ...i }));
  tables.risk_patterns = model.riskPatterns.map((p) => ({ id: p.id, name: p.name, severity: p.severity, description: p.description, embeddingText: p.embeddingText }));
  tables.pull_requests = model.pullRequests.map((pr) => ({ id: pr.id, repoId, number: pr.number, title: pr.title, authorId: pr.authorId, state: pr.state, isAiAssisted: String(pr.isAiAssisted), baseRiskScore: pr.baseRiskScore, summary: pr.summary }));
  tables.review_comments = model.reviewComments.map((c) => ({ id: c.id, prId: c.prId, reviewerId: c.reviewerId, fileId: c.fileId, issueTypeId: c.issueTypeId, sentiment: c.sentiment, body: c.body, embeddingText: c.embeddingText }));
  tables.ai_changes = model.aiChanges.map((a) => ({ id: a.id, prId: a.prId, fileId: a.fileId, summary: a.summary, embeddingText: a.embeddingText }));
  tables.security_findings = model.securityFindings.map((s) => ({ ...s }));
  tables.releases = model.releases.map((r) => ({ id: r.id, name: r.name }));
  tables.deployments = model.deployments.map((d) => ({ ...d }));
  tables.incidents = model.incidents.map((i) => ({ id: i.id, title: i.title, severity: i.severity, rootCause: i.rootCause, summary: i.summary, tracedToPr: i.tracedToPr }));
  tables.adrs = model.adrs.map((a) => ({ ...a }));
  tables.decisions = model.decisions.map((d) => ({ id: d.id, summary: d.summary, policy: d.policy, status: d.status, aboutServiceId: d.aboutServiceId, adrId: d.adrId }));
  tables.lessons = model.lessons.map((l) => ({ id: l.id, statement: l.statement, recommends: l.recommends, fromIncident: l.fromIncident }));

  tables.rel_module_deps = model.moduleDeps.map((d) => ({ source: d.source, target: d.target, reason: d.reason, regression: String(Boolean(d.regression)) }));
  for (const pr of model.pullRequests) for (const fileId of pr.files) tables.rel_pr_files.push({ prId: pr.id, fileId });
  for (const c of model.reviewComments) tables.rel_comment_issues.push({ commentId: c.id, issueTypeId: c.issueTypeId });
  for (const p of model.riskPatterns) for (const issueTypeId of p.causes) tables.rel_pattern_issues.push({ patternId: p.id, issueTypeId });
  for (const a of model.aiChanges) for (const { patternId, score } of a.patterns) tables.rel_ai_patterns.push({ aiChangeId: a.id, patternId, score });
  for (const i of model.incidents) for (const serviceId of i.impactedServices) tables.rel_incident_services.push({ incidentId: i.id, serviceId });
  for (const r of model.releases) for (const prId of r.shippedPrs) tables.rel_release_prs.push({ releaseId: r.id, prId });
  for (const l of model.lessons) {
    for (const moduleId of l.appliesToModuleIds) tables.rel_lesson_modules.push({ lessonId: l.id, moduleId });
    for (const patternId of l.appliesToPatternIds) tables.rel_lesson_patterns.push({ lessonId: l.id, patternId });
  }

  return { headers, tables };
}
