// ReviewGraph AI - API server.
//
// Domain-agnostic: it loads the active domain pack (DOMAIN env, default
// codereview) and exposes the same endpoints for every domain. The pack
// supplies the data, the explainable assessments, the question routing, and
// the agent memory.

import cors from "cors";
import express from "express";
import { runCypher, getDriver } from "./neo4j.js";
import { loadDomainPack, ACTIVE_DOMAIN } from "./domain/loader.js";
import { recordAssessment, memorySnapshot } from "./memoryStore.js";

const pack = await loadDomainPack();
if (typeof pack.init === "function") {
  const initResult = await pack.init();
  console.log(`[ReviewGraph] data source=${initResult.source} entities=${initResult.entities}${initResult.repo ? ` repo=${initResult.repo}` : ""}${initResult.project ? ` project=${initResult.project}` : ""}`);
}
const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const asyncRoute = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((error) => {
    res.status(500).json({ error: "Internal error", detail: error.message });
  });
};

app.get("/api/meta", (_req, res) => {
  res.json({ ...pack.meta, domain: ACTIVE_DOMAIN });
});

app.get("/api/health", asyncRoute(async (_req, res) => {
  if (!getDriver()) {
    res.json({ ok: true, neo4j: "fallback", reason: "Neo4j not configured", domain: ACTIVE_DOMAIN });
    return;
  }
  try {
    await runCypher("RETURN 1 AS ok");
    res.json({ ok: true, neo4j: "connected", domain: ACTIVE_DOMAIN });
  } catch (error) {
    res.json({ ok: true, neo4j: "fallback", reason: error.message, domain: ACTIVE_DOMAIN });
  }
}));

app.get("/api/entities", (_req, res) => {
  res.json(pack.listEntities());
});

app.get("/api/entities/:id", (req, res) => {
  const detail = pack.getEntity(req.params.id);
  if (!detail) {
    res.status(404).json({ error: `Unknown entity ${req.params.id}` });
    return;
  }
  res.json(detail);
});

app.post("/api/ask", asyncRoute(async (req, res) => {
  const { question = pack.meta.sampleQuestions?.[0] || "", entityId = pack.meta.flagshipEntityId } = req.body;
  const answer = pack.ask(question, entityId);

  if (!getDriver() || !answer.cypher) {
    res.json({ ...answer, neo4j: "fallback", rows: [] });
    return;
  }
  try {
    const rows = await runCypher(answer.cypher, { entityId, prId: entityId, start_date: req.body.start_date, end_date: req.body.end_date });
    res.json({ ...answer, neo4j: "connected", rows });
  } catch (error) {
    res.json({ ...answer, neo4j: "fallback", rows: [], detail: error.message });
  }
}));

app.post("/api/assess", asyncRoute(async (req, res) => {
  const { entityId = pack.meta.flagshipEntityId } = req.body;
  const assessment = pack.assess(entityId);
  if (!assessment) {
    res.status(404).json({ error: `Unknown entity ${entityId}` });
    return;
  }
  const memory = await recordAssessment(pack, assessment);
  res.json({ assessment, persisted: memory.persisted, detail: memory.detail });
}));

app.get("/api/memory", (_req, res) => res.json(memorySnapshot(pack)));

app.post("/api/cypher", asyncRoute(async (req, res) => {
  const { query, params = {} } = req.body;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    const rows = await runCypher(query, params);
    res.json({ rows });
  } catch (error) {
    res.status(503).json({ error: "Neo4j query failed", detail: error.message });
  }
}));

app.listen(port, () => {
  const src = pack.meta?.dataSource || "demo";
  const repo = pack.meta?.repository?.name;
  console.log(`ReviewGraph AI [domain=${ACTIVE_DOMAIN}, source=${src}${repo ? `, repo=${repo}` : ""}] http://127.0.0.1:${port}`);
});
