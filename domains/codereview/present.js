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
  teamForService
} from "./model.js";
import { assessPullRequest } from "./assess.js";

export function listEntities() {
  return pullRequests.map((pr) => {
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

export function buildGraph(prId) {
  const pr = index.pullRequests.get(prId);
  if (!pr) return { nodes: [], links: [] };

  const nodes = new Map();
  const links = [];
  const addNode = (id, label, group, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, group, ...extra });
  };
  const addLink = (source, target, type) => {
    if (nodes.has(source) && nodes.has(target)) {
      links.push({ source, target, type });
    }
  };

  addNode(pr.id, pr.id, "pr", { risk: assessPullRequest(pr.id)?.score });

  const files = prFiles(prId);
  for (const file of files) {
    addNode(file.id, file.path.split("/").pop(), "file", { sensitive: file.securitySensitive });
    addLink(pr.id, file.id, "MODIFIES");
    const module = index.modules.get(file.moduleId);
    if (module) {
      addNode(module.id, module.name, "module");
      addLink(file.id, module.id, "PART_OF");
      const service = index.services.get(module.serviceId);
      if (service) {
        addNode(service.id, service.name, "service", { criticality: service.criticality });
        addLink(module.id, service.id, "IN_SERVICE");
        const team = teamForService(service.id);
        if (team) {
          addNode(team.id, team.name, "team");
          addLink(team.id, service.id, "OWNS");
        }
      }
    }
  }

  // Module dependency edges among the modules in view.
  for (const dep of moduleDeps) {
    if (nodes.has(dep.source) && nodes.has(dep.target)) {
      addLink(dep.source, dep.target, "DEPENDS_ON");
    }
  }

  // AI change risk patterns.
  for (const { pattern } of patternsForPr(prId)) {
    addNode(pattern.id, pattern.name, "pattern", { severity: pattern.severity });
    addLink(pr.id, pattern.id, "SIMILAR_TO");
  }

  const serviceIds = new Set(prServices(prId).map((s) => s.id));

  // Related incidents.
  for (const incident of incidents) {
    if (incident.impactedServices.some((id) => serviceIds.has(id)) || incident.tracedToPr === prId) {
      addNode(incident.id, incident.id, "incident", { severity: incident.severity });
      for (const serviceId of incident.impactedServices) {
        if (nodes.has(serviceId)) addLink(incident.id, serviceId, "IMPACTED");
      }
    }
  }

  // Governing decisions.
  for (const decision of decisions) {
    if (serviceIds.has(decision.aboutServiceId)) {
      addNode(decision.id, decision.adrId, "decision");
      if (nodes.has(decision.aboutServiceId)) addLink(decision.id, decision.aboutServiceId, "GOVERNS");
    }
  }

  // Relevant lessons.
  const moduleNames = new Set(prModules(prId).map((m) => m.name));
  const patternIds = new Set(patternsForPr(prId).map(({ pattern }) => pattern.id));
  for (const lesson of lessons) {
    const relevant =
      lesson.appliesToModuleIds.some((id) => moduleNames.has(index.modules.get(id)?.name)) ||
      lesson.appliesToPatternIds.some((id) => patternIds.has(id));
    if (relevant) {
      addNode(lesson.id, lesson.fromIncident + " lesson", "lesson");
      const incidentNode = lesson.fromIncident;
      if (nodes.has(incidentNode)) addLink(incidentNode, lesson.id, "PRODUCED");
    }
  }

  return { nodes: [...nodes.values()], links };
}
