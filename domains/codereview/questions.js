// Text2Cypher-style question router.
//
// Classifies a natural-language review question, returns the canonical Cypher
// that answers it over the ReviewGraph schema, and computes a fallback answer
// from the in-memory world model so the API works with or without Neo4j.

import {
  index,
  prServices,
  prModules,
  patternsForPr,
  findModuleCycles,
  incidents,
  teamForService,
  prDownstreamServices,
  recommendReviewers,
  complianceViolations
} from "./model.js";
import { assessPullRequest } from "./assess.js";

const CATEGORIES = [
  { type: "coupling", test: (q) => /coupl|cycle|circular|tightly/.test(q) },
  { type: "reviewers", test: (q) => /who should review|recommend.*review|which reviewer|assign|best reviewer/.test(q) },
  { type: "propagation", test: (q) => /could break|downstream|propagat|consumer|ripple|what breaks|blast/.test(q) },
  { type: "compliance", test: (q) => /complian|violate our arch|allowed depend|forbidden|boundar|does this violate/.test(q) },
  { type: "impact", test: (q) => /impact|affected|affect|which (services|teams)|ai-generated|ai generated/.test(q) },
  { type: "incidents", test: (q) => /incident|outage|postmortem|failure|broke|production|seen this before|caused problems/.test(q) },
  { type: "ownership", test: (q) => /who owns|owner|team|expert/.test(q) },
  { type: "decisions", test: (q) => /decision|adr|policy|architecture rule|violat/.test(q) },
  { type: "lessons", test: (q) => /lesson|learned|past|history|similar concern/.test(q) },
  { type: "similarity", test: (q) => /similar|anti-pattern|antipattern|duplicate|pattern/.test(q) },
  { type: "risk", test: () => true }
];

export function classifyQuestion(question) {
  const normalized = String(question || "").toLowerCase();
  return CATEGORIES.find((category) => category.test(normalized)).type;
}

export function answerQuestion(question, prId = "PR-184") {
  const type = classifyQuestion(question);
  const builder = builders[type] || builders.risk;
  const result = builder(prId);

  return {
    type,
    prId,
    question,
    ...result,
    generatedAt: new Date().toISOString()
  };
}

const builders = {
  risk(prId) {
    const assessment = assessPullRequest(prId);
    if (!assessment) {
      return { title: "Unknown PR", answer: `No pull request ${prId} in the graph.`, evidence: [], cypher: RISK_CYPHER };
    }
    return {
      title: `Why ${prId} is ${assessment.level.toLowerCase()} risk`,
      answer: assessment.summary,
      evidence: assessment.evidence.map((item) => `${item.title}: ${item.detail}`),
      cypher: RISK_CYPHER
    };
  },

  impact(prId) {
    const services = prServices(prId);
    const teamSet = new Map();
    for (const service of services) {
      const team = teamForService(service.id);
      if (team) teamSet.set(team.id, team);
    }
    return {
      title: `Impact of ${prId}`,
      answer: `${prId} touches ${services.length} service(s) and ${teamSet.size} team(s): ${services.map((s) => s.name).join(", ")}.`,
      evidence: [
        ...services.map((s) => `Service ${s.name} (criticality: ${s.criticality})`),
        ...[...teamSet.values()].map((t) => `Owned by ${t.name}`)
      ],
      cypher: IMPACT_CYPHER
    };
  },

  coupling() {
    const cycles = findModuleCycles();
    return {
      title: "Tightly coupled modules",
      answer: cycles.length
        ? `Found ${cycles.length} dependency cycle(s). The shortest involves ${cycles[0].modules.join(" -> ")}.`
        : "No dependency cycles detected.",
      evidence: cycles.map((cycle) => `${cycle.modules.join(" -> ")} -> ${cycle.modules[0]} (length ${cycle.length})`),
      cypher: COUPLING_CYPHER
    };
  },

  similarity(prId) {
    const patterns = patternsForPr(prId);
    return {
      title: `Known patterns similar to ${prId}`,
      answer: patterns.length
        ? `${prId} resembles ${patterns.map((p) => p.pattern.name).join(", ")}.`
        : `${prId} has no AI changes matching known risk patterns.`,
      evidence: patterns.map(
        ({ pattern, score }) =>
          `${pattern.name} (${(score * 100).toFixed(0)}%) -> causes ${pattern.causes.map((id) => index.issueTypes.get(id)?.name).join(", ")}`
      ),
      cypher: SIMILARITY_CYPHER
    };
  },

  incidents(prId) {
    const services = new Set(prServices(prId).map((s) => s.id));
    const related = incidents.filter(
      (incident) => incident.impactedServices.some((id) => services.has(id)) || incident.tracedToPr === prId
    );
    return {
      title: `Incidents related to ${prId}`,
      answer: related.length
        ? `${related.length} past incident(s) touch the same services as ${prId}.`
        : `No past incidents touch the services affected by ${prId}.`,
      evidence: related.map(
        (incident) => `${incident.id} (${incident.severity}): ${incident.title} - root cause: ${incident.rootCause}`
      ),
      cypher: INCIDENTS_CYPHER
    };
  },

  ownership(prId) {
    const services = prServices(prId);
    const rows = services.map((service) => {
      const team = teamForService(service.id);
      return `${service.name} -> owned by ${team?.name || "unknown"}`;
    });
    return {
      title: `Ownership for ${prId}`,
      answer: `Ownership for the services touched by ${prId}.`,
      evidence: rows,
      cypher: OWNERSHIP_CYPHER
    };
  },

  decisions(prId) {
    const services = new Set(prServices(prId).map((s) => s.id));
    const relevant = [...index.decisions.values()].filter((d) => services.has(d.aboutServiceId));
    return {
      title: `Architectural decisions affecting ${prId}`,
      answer: relevant.length
        ? `${relevant.length} active decision(s) govern the services ${prId} touches.`
        : `No recorded decisions govern the services ${prId} touches.`,
      evidence: relevant.map((d) => `${d.summary} (${d.adrId}) - ${d.policy}`),
      cypher: DECISIONS_CYPHER
    };
  },

  reviewers(prId) {
    const ranked = recommendReviewers(prId);
    return {
      title: `Recommended reviewers for ${prId}`,
      answer: ranked.length
        ? `Top reviewers for ${prId}: ${ranked.slice(0, 3).map((r) => r.developer.name).join(", ")}.`
        : `No reviewer signals found for ${prId}.`,
      evidence: ranked
        .slice(0, 5)
        .map((r) => `${r.developer.name} (score ${r.score}) - ${r.reasons.join("; ")}`),
      cypher: REVIEWERS_CYPHER
    };
  },

  propagation(prId) {
    const touched = prServices(prId);
    const downstream = prDownstreamServices(prId);
    return {
      title: `What could break if ${prId} merges`,
      answer: downstream.length
        ? `${prId} touches ${touched.map((s) => s.name).join(", ")}. ${downstream.length} downstream service(s) consume these and could be affected: ${downstream.map((s) => s.name).join(", ")}.`
        : `${prId} touches ${touched.map((s) => s.name).join(", ") || "no tracked services"} with no downstream consumers in the graph.`,
      evidence: downstream.map((s) => `${s.name} (criticality: ${s.criticality}) consumes a touched service`),
      cypher: PROPAGATION_CYPHER
    };
  },

  compliance(prId) {
    const violations = complianceViolations(prId);
    return {
      title: `Architectural compliance for ${prId}`,
      answer: violations.length
        ? `${prId} violates ${violations.length} architectural rule(s).`
        : `${prId} does not violate any recorded architectural decisions.`,
      evidence: violations.map(
        (v) =>
          `Forbidden ${v.from?.name} -> ${v.to?.name} dependency in ${v.file.path} violates "${v.decision.summary}" (${v.decision.adrId})`
      ),
      cypher: COMPLIANCE_CYPHER
    };
  },

  lessons(prId) {
    const modules = new Set(prModules(prId).map((m) => m.id));
    const patternIds = new Set(patternsForPr(prId).map(({ pattern }) => pattern.id));
    const relevant = [...index.lessons.values()].filter(
      (lesson) =>
        lesson.appliesToModuleIds.some((id) => modules.has(id)) ||
        lesson.appliesToPatternIds.some((id) => patternIds.has(id))
    );
    return {
      title: `Lessons relevant to ${prId}`,
      answer: relevant.length
        ? `${relevant.length} lesson(s) from past incidents apply to ${prId}.`
        : `No prior lessons apply to ${prId}.`,
      evidence: relevant.map((lesson) => `${lesson.statement} (from ${lesson.fromIncident})`),
      cypher: LESSONS_CYPHER
    };
  }
};

// ---- Canonical Cypher templates over the ReviewGraph schema ----

const RISK_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(file:File)-[:PART_OF]->(module:Module)
OPTIONAL MATCH (pr)-[:HAS_REVIEW_COMMENT]->(comment:ReviewComment)-[:MENTIONS]->(issue:IssueType)
OPTIONAL MATCH cyclePath=(module)-[:DEPENDS_ON*1..3]->(module)
OPTIONAL MATCH (change:AIChange)-[:INTRODUCED_BY]->(pr)
OPTIONAL MATCH (change)-[:SIMILAR_TO]->(pattern:RiskPattern)
RETURN pr.id AS pr, pr.title AS title,
       collect(DISTINCT file.path) AS modifiedFiles,
       collect(DISTINCT module.name) AS modules,
       collect(DISTINCT issue.name) AS reviewIssues,
       collect(DISTINCT pattern.name) AS riskPatterns,
       count(DISTINCT cyclePath) AS dependencyCycles`;

const IMPACT_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(service:Service)
OPTIONAL MATCH (team:Team)-[:OWNS]->(service)
RETURN service.name AS service, service.criticality AS criticality, collect(DISTINCT team.name) AS owningTeams`;

const COUPLING_CYPHER = `MATCH path=(module:Module)-[:DEPENDS_ON*1..3]->(module)
RETURN [n IN nodes(path) | n.name] AS cycle, length(path) AS cycleLength
ORDER BY cycleLength ASC LIMIT 10`;

const SIMILARITY_CYPHER = `MATCH (change:AIChange)-[:INTRODUCED_BY]->(pr:PullRequest {id: $prId})
MATCH (change)-[s:SIMILAR_TO]->(pattern:RiskPattern)-[:CAUSES]->(issue:IssueType)
RETURN pattern.name AS pattern, s.score AS score, collect(DISTINCT issue.name) AS likelyIssues
ORDER BY score DESC`;

const INCIDENTS_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(service:Service)
MATCH (incident:Incident)-[:IMPACTED]->(service)
RETURN DISTINCT incident.id AS incident, incident.title AS title, incident.rootCause AS rootCause, incident.severity AS severity`;

const OWNERSHIP_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(service:Service)
MATCH (team:Team)-[:OWNS]->(service)
RETURN service.name AS service, team.name AS owningTeam`;

const DECISIONS_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(service:Service)
MATCH (decision:Decision)-[:ABOUT]->(service)
OPTIONAL MATCH (decision)-[:RECORDED_IN]->(adr:ADR)
RETURN decision.summary AS decision, decision.policy AS policy, adr.id AS adr`;

const LESSONS_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(module:Module)
MATCH (lesson:Lesson)-[:APPLIES_TO]->(module)
MATCH (incident:Incident)-[:PRODUCED]->(lesson)
RETURN DISTINCT lesson.statement AS lesson, lesson.recommends AS recommendation, incident.id AS fromIncident`;

const REVIEWERS_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(file:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(service:Service)
OPTIONAL MATCH (author:Developer)-[:AUTHORED]->(pr)
OPTIONAL MATCH (owner:Developer)-[:MEMBER_OF]->(:Team)-[:OWNS]->(service)
OPTIONAL MATCH (prev:Developer)-[:WROTE]->(:ReviewComment)-[:ON_FILE]->(file)
WITH author, collect(DISTINCT owner) + collect(DISTINCT prev) AS candidates
UNWIND candidates AS dev
WITH author, dev WHERE dev IS NOT NULL AND (author IS NULL OR dev <> author)
RETURN dev.name AS reviewer, count(*) AS signals ORDER BY signals DESC`;

const PROPAGATION_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(:File)-[:PART_OF]->(:Module)-[:IN_SERVICE]->(touched:Service)
WITH collect(DISTINCT touched) AS touchedServices
UNWIND touchedServices AS touched
MATCH (cm:Module)-[:DEPENDS_ON]->(:Module)-[:IN_SERVICE]->(touched)
MATCH (cm)-[:IN_SERVICE]->(downstream:Service)
WHERE NOT downstream IN touchedServices
RETURN DISTINCT downstream.name AS service, downstream.criticality AS criticality`;

const COMPLIANCE_CYPHER = `MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(file:File)
MATCH (file)-[:INTRODUCES_DEPENDENCY]->(to:Service)<-[:FORBIDS_DEPENDENCY_TO]-(decision:Decision)
OPTIONAL MATCH (decision)-[:RECORDED_IN]->(adr:ADR)
RETURN file.path AS file, decision.summary AS rule, adr.id AS adr`;
