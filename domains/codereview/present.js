// Shapes world-model data into the structures the React client renders:
// the PR list (with computed risk) and a focused graph-evidence view per PR.

import {
  index,
  pullRequests,
  prFiles,
  prModules,
  prServices,
  patternsForPr,
  moduleDeps,
  incidents,
  decisions,
  lessons,
  teamForService,
  complianceViolations,
  prDownstreamServices,
  recommendReviewers
} from "./model.js";
import { assessPullRequest } from "./assess.js";

export function listEntities() {
  return pullRequests
    .slice()
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))
    .map((pr) => {
      const assessment = assessPullRequest(pr.id);
      const author = index.developers.get(pr.authorId);
      const team = index.teams.get(author?.teamId)?.name;
      return {
        id: pr.id,
        title: pr.title,
        subtitle: `${author?.name || pr.authorId}${team ? " · " + team : ""}`,
        score: assessment?.score ?? pr.baseRiskScore,
        level: assessment?.level ?? "Unknown",
        tags: prServices(pr.id).map((s) => s.name),
        badges: [pr.isAiAssisted ? "AI-assisted" : null, pr.state].filter(Boolean),
        evidenceCount: assessment?.evidence.length ?? 0
      };
    });
}

const LAYER_ORDER = ["pr", "file", "module", "service", "team", "pattern", "decision", "adr", "incident", "lesson", "developer"];

export function buildGraph(prId) {
  const pr = index.pullRequests.get(prId);
  if (!pr) return { nodes: [], links: [], metrics: null, highlights: { nodes: [], links: [] } };

  const assessment = assessPullRequest(prId);
  const nodes = new Map();
  const links = [];
  const linkKeys = new Set();
  const highlightLinks = new Set();

  const addNode = (id, label, group, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, group, ...extra });
  };
  const addLink = (source, target, type, highlight = false) => {
    if (!nodes.has(source) || !nodes.has(target)) return;
    const key = `${source}|${target}|${type}`;
    if (linkKeys.has(key)) {
      if (highlight) highlightLinks.add(key);
      return;
    }
    linkKeys.add(key);
    links.push({ source, target, type, key });
    if (highlight) highlightLinks.add(key);
  };

  addNode(pr.id, pr.id, "pr", { risk: assessment?.score, level: assessment?.level });

  const files = prFiles(prId);
  const serviceIds = new Set();

  for (const file of files) {
    addNode(file.id, file.path.split("/").pop(), "file", {
      fullPath: file.path,
      sensitive: file.securitySensitive,
      violation: !!file.introducesDependency
    });
    addLink(pr.id, file.id, "MODIFIES", file.securitySensitive || file.introducesDependency);

    const module = index.modules.get(file.moduleId);
    if (module) {
      addNode(module.id, module.name, "module");
      addLink(file.id, module.id, "PART_OF");
      const service = index.services.get(module.serviceId);
      if (service) {
        serviceIds.add(service.id);
        addNode(service.id, service.name, "service", { criticality: service.criticality });
        addLink(module.id, service.id, "IN_SERVICE");
        const team = teamForService(service.id);
        if (team) {
          addNode(team.id, team.name, "team");
          addLink(team.id, service.id, "OWNS");
        }
      }
    }

    if (file.introducesDependency) {
      const { fromServiceId, toServiceId } = file.introducesDependency;
      const fromService = index.services.get(fromServiceId);
      const toService = index.services.get(toServiceId);
      if (fromService) addNode(fromService.id, fromService.name, "service", { criticality: "high" });
      if (toService) addNode(toService.id, toService.name, "service", { criticality: "high" });
      addLink(fromServiceId, toServiceId, "FORBIDDEN_DEP", true);
      addLink(file.id, toServiceId, "COUPLES_TO", true);
    }
  }

  for (const dep of moduleDeps) {
    if (nodes.has(dep.source) && nodes.has(dep.target)) {
      addLink(dep.source, dep.target, "DEPENDS_ON");
    }
  }

  for (const { pattern } of patternsForPr(prId)) {
    addNode(pattern.id, pattern.name, "pattern", { severity: pattern.severity });
    addLink(pr.id, pattern.id, "MATCHES_PATTERN", true);
  }

  for (const violation of complianceViolations(prId)) {
    addNode(violation.decision.id, "Policy", "decision", { summary: violation.decision.summary });
    if (violation.adr) addNode(violation.adr.id, violation.adr.title, "adr");
    addLink(violation.decision.id, violation.from.id, "GOVERNS", true);
    addLink(violation.file.id, violation.decision.id, "VIOLATES", true);
    if (violation.adr) addLink(violation.adr.id, violation.decision.id, "DOCUMENTED_BY");
  }

  for (const downstream of prDownstreamServices(prId)) {
    addNode(downstream.id, downstream.name, "service", { criticality: downstream.criticality, downstream: true });
    for (const touched of prServices(prId)) {
      addLink(touched.id, downstream.id, "DOWNSTREAM_RISK", true);
    }
  }

  for (const incident of incidents) {
    const linked =
      incident.tracedToPr === prId || incident.impactedServices.some((id) => serviceIds.has(id));
    if (!linked) continue;
    addNode(incident.id, incident.id, "incident", { severity: incident.severity });
    for (const serviceId of incident.impactedServices) {
      if (nodes.has(serviceId)) addLink(incident.id, serviceId, "IMPACTED", true);
    }
    if (incident.tracedToPr && incident.tracedToPr !== prId && nodes.has(incident.tracedToPr)) {
      addLink(pr.id, incident.tracedToPr, "SIMILAR_TO", true);
    }
  }

  const reverted = pullRequests.filter(
    (other) => other.id !== prId && other.state === "reverted" && prFiles(other.id).length > 0
  );
  for (const other of reverted.slice(0, 1)) {
    addNode(other.id, other.id, "pr", { historical: true, state: other.state });
    addLink(pr.id, other.id, "REGRESSED_FROM", true);
  }

  const moduleNames = new Set(prModules(prId).map((m) => m.name));
  const patternIds = new Set(patternsForPr(prId).map(({ pattern }) => pattern.id));
  for (const lesson of lessons) {
    const relevant =
      lesson.appliesToModuleIds.some((id) => moduleNames.has(index.modules.get(id)?.name)) ||
      lesson.appliesToPatternIds.some((id) => patternIds.has(id));
    if (relevant) {
      addNode(lesson.id, "Lesson", "lesson");
      if (nodes.has(lesson.fromIncident)) addLink(lesson.fromIncident, lesson.id, "PRODUCED", true);
    }
  }

  for (const { developer } of recommendReviewers(prId).slice(0, 2)) {
    addNode(developer.id, developer.name, "developer");
    addLink(developer.id, pr.id, "SHOULD_REVIEW");
  }

  for (const finding of index.securityFindings.values()) {
    if (finding.prId !== prId) continue;
    addNode(finding.id, finding.title, "pattern", { severity: finding.severity, finding: true });
    const file = index.files.get(finding.fileId);
    if (file) addLink(finding.id, file.id, "FOUND_IN", true);
  }

  const metrics = computeGraphMetrics(prId, nodes, links, assessment);
  const highlightNodes = new Set();
  for (const link of links) {
    if (highlightLinks.has(link.key)) {
      highlightNodes.add(link.source);
      highlightNodes.add(link.target);
    }
  }

  return {
    nodes: [...nodes.values()],
    links,
    metrics,
    highlights: { nodes: [...highlightNodes], links: [...highlightLinks] }
  };
}

export function computeGraphMetrics(prId, nodes, links, assessment) {
  const byGroup = (g) => [...nodes.values()].filter((n) => n.group === g).length;
  const services = prServices(prId);
  const downstream = prDownstreamServices(prId);
  const files = prFiles(prId);
  return {
    nodes: nodes.size,
    edges: links.length,
    layers: LAYER_ORDER.filter((g) => byGroup(g) > 0).length,
    servicesTouched: services.length,
    teamsTouched: new Set(services.map((s) => teamForService(s.id)?.id).filter(Boolean)).size,
    securityFiles: files.filter((f) => f.securitySensitive).length,
    architectureViolations: complianceViolations(prId).length,
    downstreamBlast: downstream.length,
    incidentsLinked: incidents.filter(
      (i) => i.tracedToPr === prId || i.impactedServices.some((sid) => services.some((s) => s.id === sid))
    ).length,
    evidenceItems: assessment?.evidence?.length ?? 0,
    riskScore: assessment?.score ?? 0,
    riskLevel: assessment?.level ?? "Unknown"
  };
}
