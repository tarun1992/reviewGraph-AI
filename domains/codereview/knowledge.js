// Code-review domain knowledge for the Agent Memory tab: architectural
// decisions, lessons learned, and past incidents. The generic memory store
// (server/memoryStore.js) handles recording new assessments.

import { index, decisions, lessons, incidents } from "./model.js";

export function knowledge() {
  return {
    categories: [
      {
        id: "decisions",
        title: "Decisions",
        items: decisions.map((d) => ({
          id: d.id,
          title: d.summary,
          detail: d.policy,
          tag: `${index.adrs.get(d.adrId)?.title || d.adrId} · ${index.services.get(d.aboutServiceId)?.name}`
        }))
      },
      {
        id: "lessons",
        title: "Lessons Learned",
        items: lessons.map((l) => ({
          id: l.id,
          title: l.statement,
          detail: l.recommends,
          tag: `from ${l.fromIncident}`
        }))
      },
      {
        id: "incidents",
        title: "Incidents",
        items: incidents.map((i) => ({
          id: i.id,
          title: `${i.id} · ${i.title}`,
          detail: `Root cause: ${i.rootCause}`,
          tag: `${i.severity} · ${i.impactedServices.map((s) => index.services.get(s)?.name).filter(Boolean).join(", ")}`
        }))
      }
    ]
  };
}

// Persists (:PullRequest)-[:ASSESSED_AS]->(:RiskAssessment)-[:JUSTIFIED_BY]->(:Evidence)-[:CITES]->()
export const PERSIST_ASSESSMENT_CYPHER = `
MATCH (entity:PullRequest {id: $entityId})
MERGE (assessment:RiskAssessment {id: $assessmentId})
SET assessment.level = $level, assessment.score = $score, assessment.summary = $summary, assessment.createdAt = $createdAt
MERGE (entity)-[:ASSESSED_AS]->(assessment)
WITH assessment
UNWIND $evidence AS ev
MERGE (evidence:Evidence {id: ev.id})
SET evidence.kind = ev.kind, evidence.severity = ev.severity, evidence.title = ev.title, evidence.detail = ev.detail
MERGE (assessment)-[:JUSTIFIED_BY]->(evidence)
WITH evidence, ev
UNWIND ev.cites AS citation
MATCH (target) WHERE target.id = citation.id OR target.name = citation.id OR target.path = citation.id
MERGE (evidence)-[:CITES]->(target)
`;
