import { demoData } from "./demoData.js";

export function classifyQuestion(question) {
  const normalized = question.toLowerCase();

  if (normalized.includes("coupled") || normalized.includes("coupling")) {
    return "coupling";
  }

  if (
    normalized.includes("affected") ||
    normalized.includes("ai-generated") ||
    normalized.includes("ai generated") ||
    normalized.includes("impact")
  ) {
    return "aiImpact";
  }

  if (
    normalized.includes("similar") ||
    normalized.includes("anti-pattern") ||
    normalized.includes("antipattern") ||
    normalized.includes("duplicate")
  ) {
    return "similarity";
  }

  return "risk";
}

export function answerQuestion(question, prId = "PR-184") {
  const key = classifyQuestion(question);
  const template = demoData.answers[key];

  return {
    ...template,
    type: key,
    prId,
    executableCypher: executableQueries[key],
    generatedAt: new Date().toISOString()
  };
}

export const executableQueries = {
  risk: `MATCH (pr:PR {id: $prId})-[:MODIFIES]->(file:File)
OPTIONAL MATCH (file)-[:PART_OF]->(service:Service)
OPTIONAL MATCH (file)<-[:FOUND_IN]-(smell:CodeSmell)
RETURN pr.id AS pr, file.path AS file, service.name AS service, smell.name AS smell
ORDER BY file`,
  aiImpact: `MATCH (ai:AI_Code)-[:INTRODUCED_BY]->(pr:PR)-[:MODIFIES]->(file:File)-[:PART_OF]->(service:Service)
RETURN service.name AS service, count(DISTINCT file) AS changedFiles
ORDER BY changedFiles DESC`,
  coupling: `MATCH path=(service:Service)-[:DEPENDS_ON*1..3]->(service)
RETURN service.name AS cycleEntry, length(path) AS cycleLength
ORDER BY cycleLength ASC`,
  similarity: `MATCH (ai:AI_Code)-[:SIMILAR_TO]->(pattern:AntiPattern)
OPTIONAL MATCH (pattern)-[:CAUSES]->(smell:CodeSmell)
RETURN ai.id AS generatedCode, pattern.name AS similarPattern, collect(smell.name) AS likelyIssues`
};
