// Generic Neo4j seed runner. Seeds the active domain pack's graph into Neo4j
// so the running app and the database agree. Each pack supplies its own
// statements via seedStatements().

import "./loadEnv.js";
import { closeDriver, runCypher, getDriver } from "./neo4j.js";
import { loadDomainPack, ACTIVE_DOMAIN } from "./domain/loader.js";

async function main() {
  if (!getDriver()) {
    console.error("Neo4j is not configured. Copy .env.example to .env and set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD.");
    process.exitCode = 1;
    return;
  }

  const pack = await loadDomainPack();
  if (typeof pack.init === "function") await pack.init();
  const statements = pack.seedStatements();

  try {
    for (const { query, params } of statements) {
      await runCypher(query, params);
    }
    console.log(`Seeded domain "${ACTIVE_DOMAIN}" graph: ${statements.length} statements.`);
  } finally {
    await closeDriver();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
