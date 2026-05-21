import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME;
const password = process.env.NEO4J_PASSWORD;
const database = process.env.NEO4J_DATABASE;

let driver;

export function getDriver() {
  if (!uri || !user || !password) {
    return null;
  }

  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  return driver;
}

export async function runCypher(query, params = {}) {
  const activeDriver = getDriver();

  if (!activeDriver) {
    throw new Error("Neo4j environment variables are not configured.");
  }

  const session = activeDriver.session(database ? { database } : undefined);

  try {
    const result = await session.run(query, params);
    return result.records.map((record) => record.toObject());
  } finally {
    await session.close();
  }
}

export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = undefined;
  }
}
