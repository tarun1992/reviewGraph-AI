import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE;

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
const session = driver.session(database ? { database } : undefined);

try {
  const counts = await session.run(`
    MATCH (n)
    RETURN labels(n)[0] AS label, count(*) AS count
    ORDER BY label
  `);

  console.log("Node counts");
  for (const record of counts.records) {
    console.log(`${record.get("label")}: ${record.get("count").toNumber()}`);
  }

  const risk = await session.run(`
    MATCH (pr:PullRequest {id: "PR-184"})-[:MODIFIES]->(file:File)-[:PART_OF]->(module:Module)
    OPTIONAL MATCH path=(module)-[:DEPENDS_ON*1..3]->(module)
    RETURN pr.title AS title,
           pr.baseRiskScore AS baseRiskScore,
           collect(DISTINCT file.path) AS files,
           collect(DISTINCT module.name) AS modules,
           count(DISTINCT path) AS dependencyCycles
  `);

  const row = risk.records[0];
  console.log("\nPR-184 verification");
  console.log(`Title: ${row.get("title")}`);
  console.log(`Base risk score: ${row.get("baseRiskScore")?.toNumber?.() ?? row.get("baseRiskScore")}`);
  console.log(`Files: ${row.get("files").join(", ")}`);
  console.log(`Modules: ${row.get("modules").join(", ")}`);
  console.log(`Dependency cycles: ${row.get("dependencyCycles").toNumber()}`);
} finally {
  await session.close();
  await driver.close();
}
