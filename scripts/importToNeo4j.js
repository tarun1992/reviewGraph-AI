import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processedDir = path.join(rootDir, "data", "processed");
const batchSize = 500;

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE;

if (!uri || !user || !password) {
  console.error("Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD in .env before importing.");
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

const nodeImports = [
  {
    file: "repositories.csv",
    query: `UNWIND $rows AS row
MERGE (n:Repository {id: row.id})
SET n.name = row.name, n.url = row.url, n.primaryLanguage = row.primaryLanguage`
  },
  {
    file: "pull_requests.csv",
    query: `UNWIND $rows AS row
MERGE (n:PullRequest {id: row.id})
SET n.repoId = row.repoId,
    n.number = row.number,
    n.title = row.title,
    n.author = row.author,
    n.state = row.state,
    n.isAiAssisted = toBoolean(row.isAiAssisted),
    n.riskScore = toInteger(row.riskScore),
    n.url = row.url`
  },
  {
    file: "files.csv",
    query: `UNWIND $rows AS row
MERGE (n:File {id: row.id})
SET n.repoId = row.repoId,
    n.path = row.path,
    n.module = row.module,
    n.extension = row.extension,
    n.isSecuritySensitive = toBoolean(row.isSecuritySensitive)`
  },
  {
    file: "modules.csv",
    query: `UNWIND $rows AS row
MERGE (n:Module {id: row.id})
SET n.repoId = row.repoId, n.name = row.name, n.layer = row.layer`
  },
  {
    file: "functions.csv",
    query: `UNWIND $rows AS row
MERGE (n:Function {id: row.id})
SET n.fileId = row.fileId, n.name = row.name, n.kind = row.kind`
  },
  {
    file: "reviewers.csv",
    query: `UNWIND $rows AS row
MERGE (n:Reviewer {id: row.id})
SET n.login = row.login`
  },
  {
    file: "review_comments.csv",
    query: `UNWIND $rows AS row
MERGE (n:ReviewComment {id: row.id})
SET n.prId = row.prId,
    n.reviewerId = row.reviewerId,
    n.fileId = row.fileId,
    n.body = row.body,
    n.issueType = row.issueType,
    n.sentiment = row.sentiment,
    n.embeddingText = row.embeddingText`
  },
  {
    file: "issue_types.csv",
    query: `UNWIND $rows AS row
MERGE (n:IssueType {id: row.id})
SET n.name = row.name, n.description = row.description, n.severity = row.severity`
  },
  {
    file: "risk_patterns.csv",
    query: `UNWIND $rows AS row
MERGE (n:RiskPattern {id: row.id})
SET n.name = row.name,
    n.description = row.description,
    n.severity = row.severity,
    n.embeddingText = row.embeddingText`
  },
  {
    file: "ai_changes.csv",
    query: `UNWIND $rows AS row
MERGE (n:AIChange {id: row.id})
SET n.prId = row.prId,
    n.fileId = row.fileId,
    n.summary = row.summary,
    n.embeddingText = row.embeddingText`
  }
];

const relImports = [
  ["rel_repo_prs.csv", `UNWIND $rows AS row MATCH (a:Repository {id: row.repoId}), (b:PullRequest {id: row.prId}) MERGE (a)-[:HAS_PR]->(b)`],
  ["rel_pr_files.csv", `UNWIND $rows AS row MATCH (a:PullRequest {id: row.prId}), (b:File {id: row.fileId}) MERGE (a)-[:MODIFIES]->(b)`],
  ["rel_pr_comments.csv", `UNWIND $rows AS row MATCH (a:PullRequest {id: row.prId}), (b:ReviewComment {id: row.commentId}) MERGE (a)-[:HAS_REVIEW_COMMENT]->(b)`],
  ["rel_reviewer_comments.csv", `UNWIND $rows AS row MATCH (a:Reviewer {id: row.reviewerId}), (b:ReviewComment {id: row.commentId}) MERGE (a)-[:WROTE]->(b)`],
  ["rel_comment_files.csv", `UNWIND $rows AS row MATCH (a:ReviewComment {id: row.commentId}), (b:File {id: row.fileId}) MERGE (a)-[:ON_FILE]->(b)`],
  ["rel_file_modules.csv", `UNWIND $rows AS row MATCH (a:File {id: row.fileId}), (b:Module {id: row.moduleId}) MERGE (a)-[:PART_OF]->(b)`],
  ["rel_module_deps.csv", `UNWIND $rows AS row MATCH (a:Module {id: row.sourceModuleId}), (b:Module {id: row.targetModuleId}) MERGE (a)-[r:DEPENDS_ON]->(b) SET r.reason = row.reason`],
  ["rel_file_imports.csv", `UNWIND $rows AS row MATCH (a:File {id: row.sourceFileId}), (b:File {id: row.targetFileId}) MERGE (a)-[r:IMPORTS]->(b) SET r.importName = row.importName`],
  ["rel_file_functions.csv", `UNWIND $rows AS row MATCH (a:File {id: row.fileId}), (b:Function {id: row.functionId}) MERGE (a)-[:DEFINES]->(b)`],
  ["rel_comment_issues.csv", `UNWIND $rows AS row MATCH (a:ReviewComment {id: row.commentId}), (b:IssueType {id: row.issueTypeId}) MERGE (a)-[:MENTIONS]->(b)`],
  ["rel_pattern_issues.csv", `UNWIND $rows AS row MATCH (a:RiskPattern {id: row.patternId}), (b:IssueType {id: row.issueTypeId}) MERGE (a)-[:CAUSES]->(b)`],
  ["rel_ai_patterns.csv", `UNWIND $rows AS row MATCH (a:AIChange {id: row.aiChangeId}), (b:RiskPattern {id: row.patternId}) MERGE (a)-[r:SIMILAR_TO]->(b) SET r.score = toFloat(row.score)`]
];

const constraints = [
  `CREATE CONSTRAINT repository_id IF NOT EXISTS FOR (n:Repository) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (n:PullRequest) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT file_id IF NOT EXISTS FOR (n:File) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT module_id IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT reviewer_id IF NOT EXISTS FOR (n:Reviewer) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT comment_id IF NOT EXISTS FOR (n:ReviewComment) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT issue_type_id IF NOT EXISTS FOR (n:IssueType) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT risk_pattern_id IF NOT EXISTS FOR (n:RiskPattern) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT ai_change_id IF NOT EXISTS FOR (n:AIChange) REQUIRE n.id IS UNIQUE`
];

const resetQuery = `MATCH (n)
WHERE any(label IN labels(n) WHERE label IN [
  "Repository",
  "PullRequest",
  "File",
  "Module",
  "Function",
  "Reviewer",
  "ReviewComment",
  "IssueType",
  "RiskPattern",
  "AIChange"
])
DETACH DELETE n`;

async function run(query, params = {}) {
  const session = driver.session(database ? { database } : undefined);
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

async function importCsv(file, query) {
  const rows = parseCsv(await fs.readFile(path.join(processedDir, file), "utf8"));
  for (let index = 0; index < rows.length; index += batchSize) {
    await run(query, { rows: rows.slice(index, index + batchSize) });
  }
  console.log(`Imported ${rows.length} rows from ${file}`);
}

function parseCsv(text) {
  const parsed = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      parsed.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    parsed.push(row);
  }

  const headers = parsed.shift()?.map((header) => header.trim()) || [];
  return parsed
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
    );
}

try {
  await run(resetQuery);

  for (const constraint of constraints) {
    await run(constraint);
  }

  for (const item of nodeImports) {
    await importCsv(item.file, item.query);
  }

  for (const [file, query] of relImports) {
    await importCsv(file, query);
  }

  await run(`MATCH (change:AIChange), (pr:PullRequest {id: change.prId}) MERGE (change)-[:INTRODUCED_BY]->(pr)`);
  await run(`MATCH (change:AIChange), (file:File {id: change.fileId}) MERGE (change)-[:TOUCHES]->(file)`);
  await run(`CALL db.awaitIndexes()`);
  console.log("Imported ReviewGraph AI dataset into Neo4j/Aura.");
} finally {
  await driver.close();
}
