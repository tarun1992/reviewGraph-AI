// ReviewGraph AI domain pack.

import { assessPullRequest } from "./assess.js";
import { listEntities, buildGraph } from "./present.js";
import { answerQuestion } from "./questions.js";
import { knowledge, PERSIST_ASSESSMENT_CYPHER } from "./knowledge.js";
import { seedStatements } from "./seedStatements.js";
import { ingest } from "./ingest.js";
import { LABELS, RELATIONSHIPS, CONSTRAINTS } from "./schema.js";
import { initModel, getFlagshipEntityId, getActiveSource, repositories } from "./model.js";

const meta = {
  id: "codereview",
  name: "ReviewGraph AI",
  tagline: "Aura-powered engineering intelligence for reviewing AI-written code.",
  description:
    "Combines code relationships, architectural knowledge, and persistent memory to deliver explainable reviews and impact analysis for AI-generated changes.",
  entityNoun: "Pull Request",
  entityNounPlural: "Pull Requests",
  scoreNoun: "Risk",
  brandColor: "#1d4ed8",
  flagshipEntityId: "PR-512",
  sampleQuestions: [
    "Why is this PR risky?",
    "Who should review this PR?",
    "What could break if this merges?",
    "Does this violate our architecture?",
    "Has a similar change caused problems before?",
    "Which services are becoming tightly coupled?"
  ],
  knowledgeCategories: [
    { id: "decisions", title: "Decisions" },
    { id: "lessons", title: "Lessons Learned" },
    { id: "incidents", title: "Incidents" }
  ],
  dataSource: "demo",
  repository: null
};

function syncMetaFromModel(initResult) {
  meta.flagshipEntityId = getFlagshipEntityId() || meta.flagshipEntityId;
  meta.dataSource = getActiveSource();
  const repo = repositories[0];
  meta.repository = repo
    ? { name: repo.name, url: repo.url, language: repo.primaryLanguage }
    : null;
  if (initResult?.error) meta.sourceError = initResult.error;
  else delete meta.sourceError;
}

/** Load graph from demo, GitHub, or GitLab based on .env. */
export async function init() {
  const result = await initModel();
  syncMetaFromModel(result);
  return result;
}

const pack = {
  meta,
  schema: { labels: LABELS, relationships: RELATIONSHIPS, constraints: CONSTRAINTS },
  init,
  listEntities,
  getEntity(id) {
    const assessment = assessPullRequest(id);
    if (!assessment) return null;
    return { assessment, graph: buildGraph(id) };
  },
  assess: assessPullRequest,
  ask: answerQuestion,
  knowledge,
  seedStatements,
  ingest,
  persistAssessmentCypher: PERSIST_ASSESSMENT_CYPHER
};

export default pack;
