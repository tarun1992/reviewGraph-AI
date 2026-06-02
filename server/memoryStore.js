// Generic agent-memory store.
//
// Records explainable assessments so future reviews can reference them. Writes
// to Neo4j when configured (using the active pack's persistAssessmentCypher),
// and always keeps an in-memory copy so the platform works offline.

import { getDriver, runCypher } from "./neo4j.js";

const recorded = [];

export function listAssessments() {
  return recorded;
}

export async function recordAssessment(pack, assessment) {
  const record = { ...assessment, recordedAt: new Date().toISOString() };
  recorded.unshift(record);
  if (recorded.length > 50) recorded.pop();

  if (!getDriver() || !pack.persistAssessmentCypher) {
    return { persisted: "memory", record };
  }

  try {
    await runCypher(pack.persistAssessmentCypher, {
      assessmentId: `assessment_${assessment.entityId}_${Date.now()}`,
      entityId: assessment.entityId,
      level: assessment.level,
      score: assessment.score,
      summary: assessment.summary,
      createdAt: record.recordedAt,
      evidence: assessment.evidence.map((item, i) => ({
        id: `${assessment.entityId}_ev_${i}`,
        kind: item.kind,
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        cites: item.cites
      }))
    });
    return { persisted: "neo4j", record };
  } catch (error) {
    return { persisted: "memory", record, detail: error.message };
  }
}

export function memorySnapshot(pack) {
  return {
    categories: pack.knowledge().categories,
    assessments: recorded
  };
}
