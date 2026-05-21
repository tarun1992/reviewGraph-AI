import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE;
const dimensions = 64;

if (!uri || !user || !password) {
  console.error("Set NEO4J_URI, NEO4J_USERNAME/NEO4J_USER, and NEO4J_PASSWORD in .env.");
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function embed(text) {
  const vector = Array.from({ length: dimensions }, () => 0);

  for (const token of tokenize(text)) {
    const index = hashToken(token) % dimensions;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

async function run(query, params = {}) {
  const session = driver.session(database ? { database } : undefined);
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

async function embedLabel(label, idProperty, textExpression) {
  const result = await run(`MATCH (n:${label}) RETURN n.${idProperty} AS id, ${textExpression} AS text`);
  const rows = result.records.map((record) => ({
    id: record.get("id"),
    embedding: embed(record.get("text"))
  }));

  for (const row of rows) {
    await run(`MATCH (n:${label} {${idProperty}: $id}) SET n.embedding = $embedding`, row);
  }

  console.log(`Embedded ${rows.length} ${label} nodes.`);
}

try {
  await embedLabel("ReviewComment", "id", "n.embeddingText");
  await embedLabel("AIChange", "id", "n.embeddingText");
  await embedLabel("RiskPattern", "id", "n.embeddingText");

  await run(`
    CREATE VECTOR INDEX review_comment_embedding IF NOT EXISTS
    FOR (n:ReviewComment) ON (n.embedding)
    OPTIONS {indexConfig: {
      \`vector.dimensions\`: $dimensions,
      \`vector.similarity_function\`: 'cosine'
    }}
  `, { dimensions });

  await run(`
    CREATE VECTOR INDEX ai_change_embedding IF NOT EXISTS
    FOR (n:AIChange) ON (n.embedding)
    OPTIONS {indexConfig: {
      \`vector.dimensions\`: $dimensions,
      \`vector.similarity_function\`: 'cosine'
    }}
  `, { dimensions });

  await run(`
    CREATE VECTOR INDEX risk_pattern_embedding IF NOT EXISTS
    FOR (n:RiskPattern) ON (n.embedding)
    OPTIONS {indexConfig: {
      \`vector.dimensions\`: $dimensions,
      \`vector.similarity_function\`: 'cosine'
    }}
  `, { dimensions });

  await run("CALL db.awaitIndexes()");
  console.log("Created vector indexes for Aura Agent Similarity Search.");
} finally {
  await driver.close();
}
