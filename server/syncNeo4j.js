import { getDriver, runCypher } from "./neo4j.js";
import { isAutoSyncNeo4jEnabled } from "./config.js";

/**
 * Write the active in-memory graph (codereview pack) into Neo4j so Aura Agent tools
 * query the same data as the UI. Runs on server startup when Neo4j is configured.
 */
export async function syncGraphToNeo4j(pack) {
  if (!isAutoSyncNeo4jEnabled()) {
    return { synced: false, reason: "disabled" };
  }
  if (!getDriver()) {
    return { synced: false, reason: "neo4j_not_configured" };
  }
  if (typeof pack.seedStatements !== "function") {
    return { synced: false, reason: "no_seed_statements" };
  }

  const statements = pack.seedStatements();
  if (!statements.length) {
    return { synced: false, reason: "empty_graph" };
  }
  try {
    for (const { query, params } of statements) {
      await runCypher(query, params);
    }
    return { synced: true, statements: statements.length };
  } catch (error) {
    console.error(`[ReviewGraph] Neo4j sync failed: ${error.message}`);
    return { synced: false, reason: error.message };
  }
}
