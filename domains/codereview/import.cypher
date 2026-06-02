// ReviewGraph AI Aura import (canonical schema, all three layers).
//
// Upload data/processed/*.csv to a public raw URL, then set:
//   :param baseUrl => "https://raw.githubusercontent.com/<user>/<repo>/main/data/processed/";
// and run this script in Aura Query. Produced by `npm run dataset:sample`.

CREATE CONSTRAINT repository_id IF NOT EXISTS FOR (n:Repository) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT team_id IF NOT EXISTS FOR (n:Team) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT developer_id IF NOT EXISTS FOR (n:Developer) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT service_id IF NOT EXISTS FOR (n:Service) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT module_id IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT file_id IF NOT EXISTS FOR (n:File) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (n:PullRequest) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT comment_id IF NOT EXISTS FOR (n:ReviewComment) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT issue_type_id IF NOT EXISTS FOR (n:IssueType) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT risk_pattern_id IF NOT EXISTS FOR (n:RiskPattern) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ai_change_id IF NOT EXISTS FOR (n:AIChange) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT finding_id IF NOT EXISTS FOR (n:SecurityFinding) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT release_id IF NOT EXISTS FOR (n:Release) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT deployment_id IF NOT EXISTS FOR (n:Deployment) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT incident_id IF NOT EXISTS FOR (n:Incident) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT adr_id IF NOT EXISTS FOR (n:ADR) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT decision_id IF NOT EXISTS FOR (n:Decision) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT lesson_id IF NOT EXISTS FOR (n:Lesson) REQUIRE n.id IS UNIQUE;

// ---- Nodes ----
LOAD CSV WITH HEADERS FROM $baseUrl + "repositories.csv" AS row
MERGE (n:Repository {id: row.id}) SET n.name = row.name, n.url = row.url, n.primaryLanguage = row.primaryLanguage;

LOAD CSV WITH HEADERS FROM $baseUrl + "teams.csv" AS row
MERGE (n:Team {id: row.id}) SET n.name = row.name, n.domain = row.domain;

LOAD CSV WITH HEADERS FROM $baseUrl + "developers.csv" AS row
MERGE (n:Developer {id: row.id}) SET n.name = row.name, n.login = row.login;

LOAD CSV WITH HEADERS FROM $baseUrl + "services.csv" AS row
MERGE (n:Service {id: row.id}) SET n.name = row.name, n.criticality = row.criticality;

LOAD CSV WITH HEADERS FROM $baseUrl + "modules.csv" AS row
MERGE (n:Module {id: row.id}) SET n.name = row.name, n.layer = row.layer;

LOAD CSV WITH HEADERS FROM $baseUrl + "files.csv" AS row
MERGE (n:File {id: row.id}) SET n.path = row.path, n.securitySensitive = toBoolean(row.securitySensitive);

LOAD CSV WITH HEADERS FROM $baseUrl + "issue_types.csv" AS row
MERGE (n:IssueType {id: row.id}) SET n.name = row.name, n.severity = row.severity, n.description = row.description;

LOAD CSV WITH HEADERS FROM $baseUrl + "risk_patterns.csv" AS row
MERGE (n:RiskPattern {id: row.id}) SET n.name = row.name, n.severity = row.severity, n.description = row.description, n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "pull_requests.csv" AS row
MERGE (n:PullRequest {id: row.id})
SET n.number = row.number, n.title = row.title, n.state = row.state,
    n.isAiAssisted = toBoolean(row.isAiAssisted), n.baseRiskScore = toInteger(row.baseRiskScore), n.summary = row.summary;

LOAD CSV WITH HEADERS FROM $baseUrl + "review_comments.csv" AS row
MERGE (n:ReviewComment {id: row.id}) SET n.body = row.body, n.sentiment = row.sentiment, n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "ai_changes.csv" AS row
MERGE (n:AIChange {id: row.id}) SET n.summary = row.summary, n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "security_findings.csv" AS row
MERGE (n:SecurityFinding {id: row.id}) SET n.title = row.title, n.severity = row.severity, n.description = row.description;

LOAD CSV WITH HEADERS FROM $baseUrl + "releases.csv" AS row
MERGE (n:Release {id: row.id}) SET n.name = row.name;

LOAD CSV WITH HEADERS FROM $baseUrl + "deployments.csv" AS row
MERGE (n:Deployment {id: row.id}) SET n.environment = row.environment, n.outcome = row.outcome;

LOAD CSV WITH HEADERS FROM $baseUrl + "incidents.csv" AS row
MERGE (n:Incident {id: row.id}) SET n.title = row.title, n.severity = row.severity, n.rootCause = row.rootCause, n.summary = row.summary;

LOAD CSV WITH HEADERS FROM $baseUrl + "adrs.csv" AS row
MERGE (n:ADR {id: row.id}) SET n.title = row.title, n.status = row.status;

LOAD CSV WITH HEADERS FROM $baseUrl + "decisions.csv" AS row
MERGE (n:Decision {id: row.id}) SET n.summary = row.summary, n.policy = row.policy, n.status = row.status;

LOAD CSV WITH HEADERS FROM $baseUrl + "lessons.csv" AS row
MERGE (n:Lesson {id: row.id}) SET n.statement = row.statement, n.recommends = row.recommends;

// ---- Relationships derived from node columns ----
LOAD CSV WITH HEADERS FROM $baseUrl + "developers.csv" AS row
MATCH (d:Developer {id: row.id}), (t:Team {id: row.teamId}) MERGE (d)-[:MEMBER_OF]->(t);

LOAD CSV WITH HEADERS FROM $baseUrl + "services.csv" AS row
MATCH (t:Team {id: row.teamId}), (s:Service {id: row.id}) MERGE (t)-[:OWNS]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "modules.csv" AS row
MATCH (m:Module {id: row.id}), (s:Service {id: row.serviceId}) MERGE (m)-[:IN_SERVICE]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "files.csv" AS row
MATCH (f:File {id: row.id}), (m:Module {id: row.moduleId}) MERGE (f)-[:PART_OF]->(m);

LOAD CSV WITH HEADERS FROM $baseUrl + "pull_requests.csv" AS row
MATCH (repo:Repository {id: row.repoId}), (pr:PullRequest {id: row.id}) MERGE (repo)-[:HAS_PR]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "pull_requests.csv" AS row
MATCH (d:Developer {id: row.authorId}), (pr:PullRequest {id: row.id}) MERGE (d)-[:AUTHORED]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "review_comments.csv" AS row
MATCH (pr:PullRequest {id: row.prId}), (c:ReviewComment {id: row.id}) MERGE (pr)-[:HAS_REVIEW_COMMENT]->(c);

LOAD CSV WITH HEADERS FROM $baseUrl + "review_comments.csv" AS row
MATCH (d:Developer {id: row.reviewerId}), (c:ReviewComment {id: row.id}) MERGE (d)-[:WROTE]->(c);

LOAD CSV WITH HEADERS FROM $baseUrl + "review_comments.csv" AS row
MATCH (c:ReviewComment {id: row.id}), (f:File {id: row.fileId}) MERGE (c)-[:ON_FILE]->(f);

LOAD CSV WITH HEADERS FROM $baseUrl + "ai_changes.csv" AS row
MATCH (a:AIChange {id: row.id}), (pr:PullRequest {id: row.prId}) MERGE (a)-[:INTRODUCED_BY]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "ai_changes.csv" AS row
MATCH (a:AIChange {id: row.id}), (f:File {id: row.fileId}) MERGE (a)-[:TOUCHES]->(f);

LOAD CSV WITH HEADERS FROM $baseUrl + "security_findings.csv" AS row
MATCH (sf:SecurityFinding {id: row.id}), (pr:PullRequest {id: row.prId}) MERGE (sf)-[:RAISED_ON]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "security_findings.csv" AS row
MATCH (sf:SecurityFinding {id: row.id}), (f:File {id: row.fileId}) MERGE (sf)-[:AFFECTS]->(f);

LOAD CSV WITH HEADERS FROM $baseUrl + "deployments.csv" AS row
MATCH (rel:Release {id: row.releaseId}), (dep:Deployment {id: row.id}) MERGE (rel)-[:DEPLOYED_BY]->(dep);

LOAD CSV WITH HEADERS FROM $baseUrl + "deployments.csv" AS row
MATCH (dep:Deployment {id: row.id}), (s:Service {id: row.serviceId}) MERGE (dep)-[:TARGETS]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "incidents.csv" AS row
WITH row WHERE row.tracedToPr <> ""
MATCH (i:Incident {id: row.id}), (pr:PullRequest {id: row.tracedToPr}) MERGE (i)-[:TRACED_TO]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "adrs.csv" AS row
MATCH (a:ADR {id: row.id}), (s:Service {id: row.governsServiceId}) MERGE (a)-[:GOVERNS]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "decisions.csv" AS row
MATCH (d:Decision {id: row.id}), (s:Service {id: row.aboutServiceId}) MERGE (d)-[:ABOUT]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "decisions.csv" AS row
MATCH (d:Decision {id: row.id}), (a:ADR {id: row.adrId}) MERGE (d)-[:RECORDED_IN]->(a);

LOAD CSV WITH HEADERS FROM $baseUrl + "lessons.csv" AS row
MATCH (i:Incident {id: row.fromIncident}), (l:Lesson {id: row.id}) MERGE (i)-[:PRODUCED]->(l);

// ---- Relationships from edge CSVs ----
LOAD CSV WITH HEADERS FROM $baseUrl + "rel_module_deps.csv" AS row
MATCH (s:Module {id: row.source}), (t:Module {id: row.target})
MERGE (s)-[r:DEPENDS_ON]->(t) SET r.reason = row.reason, r.regression = toBoolean(row.regression);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_pr_files.csv" AS row
MATCH (pr:PullRequest {id: row.prId}), (f:File {id: row.fileId}) MERGE (pr)-[:MODIFIES]->(f);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_comment_issues.csv" AS row
MATCH (c:ReviewComment {id: row.commentId}), (i:IssueType {id: row.issueTypeId}) MERGE (c)-[:MENTIONS]->(i);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_pattern_issues.csv" AS row
MATCH (p:RiskPattern {id: row.patternId}), (i:IssueType {id: row.issueTypeId}) MERGE (p)-[:CAUSES]->(i);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_ai_patterns.csv" AS row
MATCH (a:AIChange {id: row.aiChangeId}), (p:RiskPattern {id: row.patternId}) MERGE (a)-[r:SIMILAR_TO]->(p) SET r.score = toFloat(row.score);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_incident_services.csv" AS row
MATCH (i:Incident {id: row.incidentId}), (s:Service {id: row.serviceId}) MERGE (i)-[:IMPACTED]->(s);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_release_prs.csv" AS row
MATCH (rel:Release {id: row.releaseId}), (pr:PullRequest {id: row.prId}) MERGE (pr)-[:SHIPPED_IN]->(rel);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_lesson_modules.csv" AS row
MATCH (l:Lesson {id: row.lessonId}), (m:Module {id: row.moduleId}) MERGE (l)-[:APPLIES_TO]->(m);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_lesson_patterns.csv" AS row
MATCH (l:Lesson {id: row.lessonId}), (p:RiskPattern {id: row.patternId}) MERGE (l)-[:APPLIES_TO]->(p);

CALL db.awaitIndexes();
