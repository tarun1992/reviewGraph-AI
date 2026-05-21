// ReviewGraph AI Aura import script
// Upload data/processed/*.csv to a public raw URL or Aura-supported import location.
// Replace $baseUrl with the folder URL ending in a slash, for example:
// :param baseUrl => "https://raw.githubusercontent.com/tarun1992/reviewGraph-AI/main/data/processed/";

CREATE CONSTRAINT repository_id IF NOT EXISTS FOR (n:Repository) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (n:PullRequest) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT file_id IF NOT EXISTS FOR (n:File) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT module_id IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT reviewer_id IF NOT EXISTS FOR (n:Reviewer) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT comment_id IF NOT EXISTS FOR (n:ReviewComment) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT issue_type_id IF NOT EXISTS FOR (n:IssueType) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT risk_pattern_id IF NOT EXISTS FOR (n:RiskPattern) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT ai_change_id IF NOT EXISTS FOR (n:AIChange) REQUIRE n.id IS UNIQUE;

LOAD CSV WITH HEADERS FROM $baseUrl + "repositories.csv" AS row
MERGE (n:Repository {id: row.id})
SET n.name = row.name,
    n.url = row.url,
    n.primaryLanguage = row.primaryLanguage;

LOAD CSV WITH HEADERS FROM $baseUrl + "pull_requests.csv" AS row
MERGE (n:PullRequest {id: row.id})
SET n.repoId = row.repoId,
    n.number = row.number,
    n.title = row.title,
    n.author = row.author,
    n.state = row.state,
    n.isAiAssisted = toBoolean(row.isAiAssisted),
    n.riskScore = toInteger(row.riskScore),
    n.url = row.url;

LOAD CSV WITH HEADERS FROM $baseUrl + "files.csv" AS row
MERGE (n:File {id: row.id})
SET n.repoId = row.repoId,
    n.path = row.path,
    n.module = row.module,
    n.extension = row.extension,
    n.isSecuritySensitive = toBoolean(row.isSecuritySensitive);

LOAD CSV WITH HEADERS FROM $baseUrl + "modules.csv" AS row
MERGE (n:Module {id: row.id})
SET n.repoId = row.repoId,
    n.name = row.name,
    n.layer = row.layer;

LOAD CSV WITH HEADERS FROM $baseUrl + "functions.csv" AS row
MERGE (n:Function {id: row.id})
SET n.fileId = row.fileId,
    n.name = row.name,
    n.kind = row.kind;

LOAD CSV WITH HEADERS FROM $baseUrl + "reviewers.csv" AS row
MERGE (n:Reviewer {id: row.id})
SET n.login = row.login;

LOAD CSV WITH HEADERS FROM $baseUrl + "review_comments.csv" AS row
MERGE (n:ReviewComment {id: row.id})
SET n.prId = row.prId,
    n.reviewerId = row.reviewerId,
    n.fileId = row.fileId,
    n.body = row.body,
    n.issueType = row.issueType,
    n.sentiment = row.sentiment,
    n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "issue_types.csv" AS row
MERGE (n:IssueType {id: row.id})
SET n.name = row.name,
    n.description = row.description,
    n.severity = row.severity;

LOAD CSV WITH HEADERS FROM $baseUrl + "risk_patterns.csv" AS row
MERGE (n:RiskPattern {id: row.id})
SET n.name = row.name,
    n.description = row.description,
    n.severity = row.severity,
    n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "ai_changes.csv" AS row
MERGE (n:AIChange {id: row.id})
SET n.prId = row.prId,
    n.fileId = row.fileId,
    n.summary = row.summary,
    n.embeddingText = row.embeddingText;

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_repo_prs.csv" AS row
MATCH (repo:Repository {id: row.repoId}), (pr:PullRequest {id: row.prId})
MERGE (repo)-[:HAS_PR]->(pr);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_pr_files.csv" AS row
MATCH (pr:PullRequest {id: row.prId}), (file:File {id: row.fileId})
MERGE (pr)-[:MODIFIES]->(file);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_pr_comments.csv" AS row
MATCH (pr:PullRequest {id: row.prId}), (comment:ReviewComment {id: row.commentId})
MERGE (pr)-[:HAS_REVIEW_COMMENT]->(comment);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_reviewer_comments.csv" AS row
MATCH (reviewer:Reviewer {id: row.reviewerId}), (comment:ReviewComment {id: row.commentId})
MERGE (reviewer)-[:WROTE]->(comment);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_comment_files.csv" AS row
MATCH (comment:ReviewComment {id: row.commentId}), (file:File {id: row.fileId})
MERGE (comment)-[:ON_FILE]->(file);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_file_modules.csv" AS row
MATCH (file:File {id: row.fileId}), (module:Module {id: row.moduleId})
MERGE (file)-[:PART_OF]->(module);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_module_deps.csv" AS row
MATCH (source:Module {id: row.sourceModuleId}), (target:Module {id: row.targetModuleId})
MERGE (source)-[rel:DEPENDS_ON]->(target)
SET rel.reason = row.reason;

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_file_imports.csv" AS row
MATCH (source:File {id: row.sourceFileId}), (target:File {id: row.targetFileId})
MERGE (source)-[rel:IMPORTS]->(target)
SET rel.importName = row.importName;

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_file_functions.csv" AS row
MATCH (file:File {id: row.fileId}), (fn:Function {id: row.functionId})
MERGE (file)-[:DEFINES]->(fn);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_comment_issues.csv" AS row
MATCH (comment:ReviewComment {id: row.commentId}), (issue:IssueType {id: row.issueTypeId})
MERGE (comment)-[:MENTIONS]->(issue);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_pattern_issues.csv" AS row
MATCH (pattern:RiskPattern {id: row.patternId}), (issue:IssueType {id: row.issueTypeId})
MERGE (pattern)-[:CAUSES]->(issue);

LOAD CSV WITH HEADERS FROM $baseUrl + "rel_ai_patterns.csv" AS row
MATCH (change:AIChange {id: row.aiChangeId}), (pattern:RiskPattern {id: row.patternId})
MERGE (change)-[rel:SIMILAR_TO]->(pattern)
SET rel.score = toFloat(row.score);

MATCH (change:AIChange), (pr:PullRequest {id: change.prId})
MERGE (change)-[:INTRODUCED_BY]->(pr);

MATCH (change:AIChange), (file:File {id: change.fileId})
MERGE (change)-[:TOUCHES]->(file);

CALL db.awaitIndexes();
