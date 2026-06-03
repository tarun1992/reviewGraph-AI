// Builds the Cypher statements that seed the full code-review graph (Layers
// 1-3) into Neo4j from the world model.

import { CONSTRAINTS } from "./schema.js";
import * as model from "./model.js";
import { assessPullRequest } from "./assess.js";

const SEED_LABELS = [
  "Repository", "Team", "Developer", "Service", "Module", "File", "PullRequest",
  "Reviewer", "ReviewComment", "IssueType", "RiskPattern", "AIChange",
  "SecurityFinding", "Release", "Deployment", "Incident", "ADR",
  "Decision", "RiskAssessment", "Evidence", "Lesson"
];

export function seedStatements() {
  const steps = [];
  const step = (query, params = {}) => steps.push({ query, params });

  if (!model.repositories?.length || !model.pullRequests?.length) {
    return steps;
  }

  step(`MATCH (n) WHERE any(label IN labels(n) WHERE label IN $labels) DETACH DELETE n`, { labels: SEED_LABELS });

  for (const [label, prop] of CONSTRAINTS) {
    step(`CREATE CONSTRAINT ${label.toLowerCase()}_${prop} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE`);
  }

  step(`UNWIND $rows AS row MERGE (n:Repository {id: row.id}) SET n += row`, { rows: model.repositories });
  step(`UNWIND $rows AS row MERGE (n:Team {id: row.id}) SET n += row`, { rows: model.teams });
  step(`UNWIND $rows AS row MERGE (n:Developer {id: row.id}) SET n.name = row.name, n.login = row.login`, { rows: model.developers });
  step(`UNWIND $rows AS row MERGE (n:Service {id: row.id}) SET n.name = row.name, n.criticality = row.criticality`, { rows: model.services });
  step(`UNWIND $rows AS row MERGE (n:Module {id: row.id}) SET n.name = row.name, n.layer = row.layer`, { rows: model.modules });
  step(`UNWIND $rows AS row MERGE (n:File {id: row.id}) SET n.path = row.path, n.securitySensitive = row.securitySensitive`, { rows: model.files });
  step(`UNWIND $rows AS row MERGE (n:IssueType {id: row.id}) SET n.name = row.name, n.severity = row.severity, n.description = row.description`, { rows: model.issueTypes });
  step(`UNWIND $rows AS row MERGE (n:RiskPattern {id: row.id}) SET n.name = row.name, n.severity = row.severity, n.description = row.description, n.embeddingText = row.embeddingText`, { rows: model.riskPatterns });
  const prRows = model.pullRequests.map((pr) => {
    const assessment = assessPullRequest(pr.id);
    const graphSignals = assessment?.evidence?.length ?? 0;
    return {
      ...pr,
      riskScore: assessment?.score ?? pr.baseRiskScore,
      riskLevel: assessment?.level ?? "Unknown",
      evidenceCount: graphSignals,
      hasGraphRisk: graphSignals > 0,
      isAiAssisted: pr.isAiAssisted || model.aiChanges.some((c) => c.prId === pr.id)
    };
  });
  step(
    `UNWIND $rows AS row MERGE (n:PullRequest {id: row.id}) SET n.number = row.number, n.title = row.title, n.state = row.state, n.isAiAssisted = row.isAiAssisted, n.baseRiskScore = row.baseRiskScore, n.summary = row.summary, n.riskScore = row.riskScore, n.riskLevel = row.riskLevel, n.evidenceCount = row.evidenceCount, n.hasGraphRisk = row.hasGraphRisk`,
    { rows: prRows }
  );
  step(`UNWIND $rows AS row MERGE (n:ReviewComment {id: row.id}) SET n.body = row.body, n.sentiment = row.sentiment, n.embeddingText = row.embeddingText`, { rows: model.reviewComments });
  step(`UNWIND $rows AS row MERGE (n:AIChange {id: row.id}) SET n.summary = row.summary, n.embeddingText = row.embeddingText`, { rows: model.aiChanges });
  step(`UNWIND $rows AS row MERGE (n:SecurityFinding {id: row.id}) SET n.title = row.title, n.severity = row.severity, n.description = row.description`, { rows: model.securityFindings });
  step(`UNWIND $rows AS row MERGE (n:Release {id: row.id}) SET n.name = row.name`, { rows: model.releases });
  step(`UNWIND $rows AS row MERGE (n:Deployment {id: row.id}) SET n.environment = row.environment, n.outcome = row.outcome`, { rows: model.deployments });
  step(`UNWIND $rows AS row MERGE (n:Incident {id: row.id}) SET n.title = row.title, n.severity = row.severity, n.rootCause = row.rootCause, n.summary = row.summary`, { rows: model.incidents });
  step(`UNWIND $rows AS row MERGE (n:ADR {id: row.id}) SET n.title = row.title, n.status = row.status`, { rows: model.adrs });
  step(`UNWIND $rows AS row MERGE (n:Decision {id: row.id}) SET n.summary = row.summary, n.policy = row.policy, n.status = row.status`, { rows: model.decisions });
  step(`UNWIND $rows AS row MERGE (n:Lesson {id: row.id}) SET n.statement = row.statement, n.recommends = row.recommends`, { rows: model.lessons });

  const repoId = model.repositories[0].id;
  step(`MATCH (repo:Repository {id: $repoId}), (pr:PullRequest) MERGE (repo)-[:HAS_PR]->(pr)`, { repoId });
  step(`UNWIND $rows AS row MATCH (d:Developer {id: row.id}), (t:Team {id: row.teamId}) MERGE (d)-[:MEMBER_OF]->(t)`, { rows: model.developers });
  step(`UNWIND $rows AS row MATCH (t:Team {id: row.teamId}), (s:Service {id: row.id}) MERGE (t)-[:OWNS]->(s)`, { rows: model.services });
  step(`UNWIND $rows AS row MATCH (m:Module {id: row.id}), (s:Service {id: row.serviceId}) MERGE (m)-[:IN_SERVICE]->(s)`, { rows: model.modules });
  step(`UNWIND $rows AS row MATCH (f:File {id: row.id}), (m:Module {id: row.moduleId}) MERGE (f)-[:PART_OF]->(m)`, { rows: model.files });
  step(`UNWIND $rows AS row MATCH (s:Module {id: row.source}), (t:Module {id: row.target}) MERGE (s)-[r:DEPENDS_ON]->(t) SET r.reason = row.reason, r.regression = coalesce(row.regression, false)`, { rows: model.moduleDeps });

  const introduced = model.files
    .filter((f) => f.introducesDependency)
    .map((f) => ({ id: f.id, toServiceId: f.introducesDependency.toServiceId }));
  step(`UNWIND $rows AS row MATCH (f:File {id: row.id}), (s:Service {id: row.toServiceId}) MERGE (f)-[:INTRODUCES_DEPENDENCY]->(s)`, { rows: introduced });

  const forbidden = model.decisions
    .filter((d) => d.forbids)
    .map((d) => ({ id: d.id, toServiceId: d.forbids.toServiceId }));
  step(`UNWIND $rows AS row MATCH (d:Decision {id: row.id}), (s:Service {id: row.toServiceId}) MERGE (d)-[:FORBIDS_DEPENDENCY_TO]->(s)`, { rows: forbidden });
  step(`UNWIND $rows AS row MATCH (pr:PullRequest {id: row.id}) UNWIND row.files AS fileId MATCH (f:File {id: fileId}) MERGE (pr)-[:MODIFIES]->(f)`, { rows: model.pullRequests });
  step(`UNWIND $rows AS row MATCH (d:Developer {id: row.authorId}), (pr:PullRequest {id: row.id}) MERGE (d)-[:AUTHORED]->(pr)`, { rows: model.pullRequests });
  step(`UNWIND $rows AS row MATCH (pr:PullRequest {id: row.prId}), (c:ReviewComment {id: row.id}) MERGE (pr)-[:HAS_REVIEW_COMMENT]->(c)`, { rows: model.reviewComments });
  step(`UNWIND $rows AS row MATCH (d:Developer {id: row.reviewerId}), (c:ReviewComment {id: row.id}) MERGE (d)-[:WROTE]->(c)`, { rows: model.reviewComments });
  step(`UNWIND $rows AS row MATCH (c:ReviewComment {id: row.id}), (f:File {id: row.fileId}) MERGE (c)-[:ON_FILE]->(f)`, { rows: model.reviewComments });
  step(`UNWIND $rows AS row MATCH (c:ReviewComment {id: row.id}), (i:IssueType {id: row.issueTypeId}) MERGE (c)-[:MENTIONS]->(i)`, { rows: model.reviewComments });
  step(`UNWIND $rows AS row MATCH (p:RiskPattern {id: row.id}) UNWIND row.causes AS issueId MATCH (i:IssueType {id: issueId}) MERGE (p)-[:CAUSES]->(i)`, { rows: model.riskPatterns });
  step(`UNWIND $rows AS row MATCH (a:AIChange {id: row.id}), (pr:PullRequest {id: row.prId}) MERGE (a)-[:INTRODUCED_BY]->(pr)`, { rows: model.aiChanges });
  step(`UNWIND $rows AS row MATCH (a:AIChange {id: row.id}), (f:File {id: row.fileId}) MERGE (a)-[:TOUCHES]->(f)`, { rows: model.aiChanges });
  step(`UNWIND $rows AS row MATCH (a:AIChange {id: row.id}) UNWIND row.patterns AS p MATCH (pat:RiskPattern {id: p.patternId}) MERGE (a)-[r:SIMILAR_TO]->(pat) SET r.score = p.score`, { rows: model.aiChanges });
  step(`UNWIND $rows AS row MATCH (sf:SecurityFinding {id: row.id}), (pr:PullRequest {id: row.prId}) MERGE (sf)-[:RAISED_ON]->(pr)`, { rows: model.securityFindings });
  step(`UNWIND $rows AS row MATCH (sf:SecurityFinding {id: row.id}), (f:File {id: row.fileId}) MERGE (sf)-[:AFFECTS]->(f)`, { rows: model.securityFindings });
  step(`UNWIND $rows AS row MATCH (rel:Release {id: row.id}) UNWIND row.shippedPrs AS prId MATCH (pr:PullRequest {id: prId}) MERGE (pr)-[:SHIPPED_IN]->(rel)`, { rows: model.releases });
  step(`UNWIND $rows AS row MATCH (rel:Release {id: row.releaseId}), (dep:Deployment {id: row.id}) MERGE (rel)-[:DEPLOYED_BY]->(dep)`, { rows: model.deployments });
  step(`UNWIND $rows AS row MATCH (dep:Deployment {id: row.id}), (s:Service {id: row.serviceId}) MERGE (dep)-[:TARGETS]->(s)`, { rows: model.deployments });
  step(`UNWIND $rows AS row MATCH (i:Incident {id: row.id}) UNWIND row.impactedServices AS sId MATCH (s:Service {id: sId}) MERGE (i)-[:IMPACTED]->(s)`, { rows: model.incidents });
  step(`UNWIND $rows AS row MATCH (i:Incident {id: row.id}), (pr:PullRequest {id: row.tracedToPr}) MERGE (i)-[:TRACED_TO]->(pr)`, { rows: model.incidents });
  step(`UNWIND $rows AS row MATCH (a:ADR {id: row.id}), (s:Service {id: row.governsServiceId}) MERGE (a)-[:GOVERNS]->(s)`, { rows: model.adrs });
  step(`UNWIND $rows AS row MATCH (d:Decision {id: row.id}), (s:Service {id: row.aboutServiceId}) MERGE (d)-[:ABOUT]->(s)`, { rows: model.decisions });
  step(`UNWIND $rows AS row MATCH (d:Decision {id: row.id}), (a:ADR {id: row.adrId}) MERGE (d)-[:RECORDED_IN]->(a)`, { rows: model.decisions });
  step(`UNWIND $rows AS row MATCH (i:Incident {id: row.fromIncident}), (l:Lesson {id: row.id}) MERGE (i)-[:PRODUCED]->(l)`, { rows: model.lessons });
  step(`UNWIND $rows AS row MATCH (l:Lesson {id: row.id}) UNWIND row.appliesToModuleIds AS mId MATCH (m:Module {id: mId}) MERGE (l)-[:APPLIES_TO]->(m)`, { rows: model.lessons });
  step(`UNWIND $rows AS row MATCH (l:Lesson {id: row.id}) UNWIND row.appliesToPatternIds AS pId MATCH (p:RiskPattern {id: pId}) MERGE (l)-[:APPLIES_TO]->(p)`, { rows: model.lessons });

  return steps;
}
