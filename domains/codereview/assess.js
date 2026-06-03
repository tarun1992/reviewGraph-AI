// Explainable risk engine.
//
// Produces a RiskAssessment for a pull request by traversing the world model
// and collecting weighted, graph-cited Evidence. The guiding rule from
// docs/product-context.md: no verdict without evidence. Every contribution to
// the score carries the exact nodes that justify it.

import {
  index,
  pullRequests,
  decisions,
  incidents,
  lessons,
  prFiles,
  prModules,
  prServices,
  prComments,
  patternsForPr,
  teamForService,
  findModuleCycles,
  lexicalSimilarity,
  prDownstreamServices,
  recommendReviewers,
  complianceViolations
} from "./model.js";
import { SEVERITY_WEIGHT, levelForScore, cite } from "../../server/domain/contract.js";

export function assessPullRequest(prId) {
  const pr = index.pullRequests.get(prId);
  if (!pr) {
    return null;
  }

  const files = prFiles(prId);
  const modules = prModules(prId);
  const services = prServices(prId);
  const moduleNames = new Set(modules.map((m) => m.name));
  const author = index.developers.get(pr.authorId);
  const evidence = [];

  // 1. Security-sensitive files.
  const sensitiveFiles = files.filter((file) => file.securitySensitive);
  if (sensitiveFiles.length > 0) {
    evidence.push({
      kind: "security_sensitive_files",
      severity: "high",
      title: "Touches security-sensitive code",
      detail: `${sensitiveFiles.length} modified file(s) handle authentication, tokens, or sessions.`,
      weight: Math.min(sensitiveFiles.length * 6, 18),
      cites: sensitiveFiles.map((file) => cite("File", file.id, file.path))
    });
  }

  // 2. Security findings raised on the PR.
  for (const finding of index.securityFindings.values()) {
    if (finding.prId !== prId) continue;
    const file = index.files.get(finding.fileId);
    evidence.push({
      kind: "security_finding",
      severity: finding.severity,
      title: `Security finding: ${finding.title}`,
      detail: finding.description,
      weight: SEVERITY_WEIGHT[finding.severity] || 10,
      cites: [
        cite("SecurityFinding", finding.id, finding.title),
        file && cite("File", file.id, file.path)
      ].filter(Boolean)
    });
  }

  // 3. AI-introduced risk patterns.
  for (const { pattern, score } of patternsForPr(prId)) {
    const causes = pattern.causes
      .map((id) => index.issueTypes.get(id)?.name)
      .filter(Boolean);
    evidence.push({
      kind: "risk_pattern",
      severity: pattern.severity,
      title: `Resembles known risk pattern: ${pattern.name}`,
      detail: `${pattern.description} (similarity ${(score * 100).toFixed(0)}%). Linked to: ${causes.join(", ")}.`,
      weight: Math.round((SEVERITY_WEIGHT[pattern.severity] || 10) * score),
      cites: [cite("RiskPattern", pattern.id, pattern.name)]
    });
  }

  // 4. Dependency cycles touching the impacted modules.
  const cycles = findModuleCycles().filter((cycle) =>
    cycle.modules.some((name) => moduleNames.has(name))
  );
  for (const cycle of cycles) {
    const relatedLesson = lessons.find((lesson) =>
      lesson.appliesToModuleIds.some((id) => moduleNames.has(index.modules.get(id)?.name))
      && lesson.appliesToPatternIds.includes("pattern_circular")
    );
    const relatedIncident = incidents.find((incident) => incident.rootCause === "Circular dependency");
    evidence.push({
      kind: "dependency_cycle",
      severity: "high",
      title: "Sits on a module dependency cycle",
      detail: `Cycle of length ${cycle.length}: ${cycle.modules.join(" -> ")} -> ${cycle.modules[0]}.`,
      weight: 20,
      cites: [
        ...cycle.modules.map((name) => cite("Module", name, name)),
        relatedIncident && cite("Incident", relatedIncident.id, relatedIncident.title),
        relatedLesson && cite("Lesson", relatedLesson.id, relatedLesson.statement)
      ].filter(Boolean)
    });
  }

  // 5. Architectural decision violations + coupling regressions.
  for (const file of files) {
    if (!file.introducesDependency) continue;
    const { fromServiceId, toServiceId } = file.introducesDependency;
    const fromService = index.services.get(fromServiceId);
    const toService = index.services.get(toServiceId);

    const violatedDecision = decisions.find((decision) => {
      const f = decision.forbids;
      return (
        decision.status === "active" &&
        f &&
        f.fromServiceId === fromServiceId &&
        f.toServiceId === toServiceId
      );
    });

    // Prior PRs that introduced the same coupling (especially reverted ones).
    const priorPr = pullRequests.find((other) => {
      if (other.id === prId) return false;
      return prFiles(other.id).some((f) => {
        const d = f.introducesDependency;
        return d && d.fromServiceId === fromServiceId && d.toServiceId === toServiceId;
      });
    });
    const relatedIncident = incidents.find(
      (incident) => priorPr && incident.tracedToPr === priorPr.id
    );

    const cites = [
      cite("File", file.id, file.path),
      fromService && cite("Service", fromService.id, fromService.name),
      toService && cite("Service", toService.id, toService.name),
      violatedDecision && cite("Decision", violatedDecision.id, violatedDecision.summary),
      violatedDecision && index.adrs.get(violatedDecision.adrId) && cite("ADR", violatedDecision.adrId, index.adrs.get(violatedDecision.adrId).title),
      priorPr && cite("PullRequest", priorPr.id, priorPr.title),
      relatedIncident && cite("Incident", relatedIncident.id, relatedIncident.title)
    ].filter(Boolean);

    let detail = `Introduces a direct ${fromService?.name} -> ${toService?.name} dependency.`;
    if (priorPr && relatedIncident) {
      detail += ` Similar coupling in ${priorPr.id} contributed to ${relatedIncident.id} and was ${priorPr.state === "reverted" ? "later reverted" : "flagged"}.`;
    }
    if (violatedDecision) {
      detail += ` Violates decision: "${violatedDecision.summary}".`;
    }

    evidence.push({
      kind: "coupling_regression",
      severity: "high",
      title: "Reintroduces a previously harmful service coupling",
      detail,
      weight: relatedIncident ? 25 : violatedDecision ? 20 : 15,
      cites
    });
  }

  for (const violation of complianceViolations(prId)) {
    evidence.push({
      kind: "architecture_violation",
      severity: "high",
      title: "Violates architecture policy",
      detail: `${violation.file.path} breaks "${violation.decision.summary}" (${violation.adr?.title || violation.decision.adrId}).`,
      weight: 18,
      cites: [
        cite("File", violation.file.id, violation.file.path),
        cite("Decision", violation.decision.id, violation.decision.summary),
        violation.adr && cite("ADR", violation.adr.id, violation.adr.title),
        cite("Service", violation.from.id, violation.from.name),
        cite("Service", violation.to.id, violation.to.name)
      ].filter(Boolean)
    });
  }

  const downstream = prDownstreamServices(prId);
  if (downstream.length > 0) {
    evidence.push({
      kind: "blast_radius",
      severity: downstream.length > 2 ? "high" : "medium",
      title: "Downstream services may break on merge",
      detail: `Changes propagate to ${downstream.length} consumer service(s): ${downstream.map((s) => s.name).join(", ")}.`,
      weight: Math.min(8 + downstream.length * 4, 22),
      cites: downstream.map((s) => cite("Service", s.id, s.name))
    });
  }

  // 6. Similar historical pull requests (pattern + summary overlap).
  const currentPatternIds = new Set(patternsForPr(prId).map(({ pattern }) => pattern.id));
  const similarPrs = pullRequests
    .filter((other) => other.id !== prId)
    .map((other) => {
      const otherPatternIds = new Set(patternsForPr(other.id).map(({ pattern }) => pattern.id));
      const sharedPatterns = [...currentPatternIds].filter((id) => otherPatternIds.has(id));
      const textScore = lexicalSimilarity(pr.summary, other.summary);
      const score = sharedPatterns.length * 0.5 + textScore;
      return { other, sharedPatterns, score };
    })
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  for (const { other, score } of similarPrs) {
    const incident = incidents.find((i) => i.tracedToPr === other.id);
    evidence.push({
      kind: "similar_pr",
      severity: incident ? "high" : "medium",
      title: `Similar to historical ${other.id}`,
      detail: `${other.title} (${(score * 100).toFixed(0)}% similar, state: ${other.state}).${incident ? ` That change is traced to ${incident.id}.` : ""}`,
      weight: incident ? 12 : 6,
      cites: [
        cite("PullRequest", other.id, other.title),
        incident && cite("Incident", incident.id, incident.title)
      ].filter(Boolean)
    });
  }

  // 7. Relevant lessons learned.
  const relevantLessons = lessons.filter(
    (lesson) =>
      lesson.appliesToModuleIds.some((id) => moduleNames.has(index.modules.get(id)?.name)) ||
      lesson.appliesToPatternIds.some((id) => currentPatternIds.has(id))
  );
  for (const lesson of relevantLessons) {
    evidence.push({
      kind: "lesson",
      severity: "medium",
      title: "Relevant lesson from past incident",
      detail: `${lesson.statement} Recommendation: ${lesson.recommends}`,
      weight: 5,
      cites: [
        cite("Lesson", lesson.id, lesson.statement),
        cite("Incident", lesson.fromIncident, lesson.fromIncident)
      ]
    });
  }

  // 8. Cross-team blast radius.
  const impactedTeams = new Map();
  for (const service of services) {
    const team = teamForService(service.id);
    if (team) impactedTeams.set(team.id, team);
  }
  const authorTeamId = author ? index.teams.get(index.developers.get(pr.authorId)?.teamId)?.id : null;
  const otherTeams = [...impactedTeams.values()].filter((team) => team.id !== authorTeamId);
  if (otherTeams.length > 0) {
    evidence.push({
      kind: "cross_team_impact",
      severity: "medium",
      title: "Crosses team ownership boundaries",
      detail: `Impacts ${otherTeams.length} team(s) beyond the author: ${otherTeams.map((t) => t.name).join(", ")}.`,
      weight: otherTeams.length * 4,
      cites: otherTeams.map((team) => cite("Team", team.id, team.name))
    });
  }

  const evidenceWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(pr.baseRiskScore * 0.5 + evidenceWeight)));
  const level = levelForScore(score);

  return {
    entityId: pr.id,
    title: pr.title,
    author: author?.name || pr.authorId,
    isAiAssisted: pr.isAiAssisted,
    state: pr.state,
    level,
    score,
    summary: buildSummary(pr, level, evidence, services),
    impacts: [
      {
        group: "Services",
        items: services.map((s) => ({ id: s.id, label: s.name, meta: s.criticality }))
      },
      {
        group: "Teams",
        items: [...impactedTeams.values()].map((t) => ({ id: t.id, label: t.name }))
      },
      {
        group: "Files",
        items: files.map((f) => ({ id: f.id, label: f.path, meta: f.securitySensitive ? "sensitive" : "" }))
      },
      {
        group: "Downstream services (risk propagation)",
        items: prDownstreamServices(prId).map((s) => ({ id: s.id, label: s.name, meta: s.criticality }))
      },
      {
        group: "Recommended reviewers",
        items: recommendReviewers(prId).slice(0, 3).map((r) => ({ id: r.developer.id, label: r.developer.name, meta: r.reasons[0] }))
      }
    ],
    evidence,
    generatedAt: new Date().toISOString()
  };
}

function buildSummary(pr, level, evidence, services) {
  const headlines = evidence
    .filter((item) => item.severity === "high" || item.severity === "critical")
    .slice(0, 3)
    .map((item) => item.title);

  const serviceNames = services.map((s) => s.name).join(", ");
  if (headlines.length === 0) {
    return `${pr.id} is assessed as ${level} risk. It affects ${serviceNames || "no tracked services"} with no high-severity graph evidence.`;
  }
  return `${pr.id} is assessed as ${level} risk. Key signals: ${headlines.join("; ")}. Affected services: ${serviceNames}.`;
}
