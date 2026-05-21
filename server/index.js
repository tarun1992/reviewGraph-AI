import cors from "cors";
import express from "express";
import { demoData } from "./demoData.js";
import { runCypher } from "./neo4j.js";
import { answerQuestion } from "./questionRouter.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await runCypher("RETURN 1 AS ok");
    res.json({ ok: true, neo4j: "connected" });
  } catch (error) {
    res.json({ ok: true, neo4j: "fallback", reason: error.message });
  }
});

app.get("/api/prs", (_req, res) => {
  res.json(demoData.prs);
});

app.get("/api/graph", (_req, res) => {
  res.json(demoData.graph);
});

app.post("/api/ask", async (req, res) => {
  const { question = "Why is this PR risky?", prId = "PR-184" } = req.body;
  const answer = answerQuestion(question, prId);

  try {
    const rows = await runCypher(answer.executableCypher, { prId });
    res.json({ ...answer, neo4j: "connected", rows });
  } catch (error) {
    res.json({ ...answer, neo4j: "fallback", rows: [], detail: error.message });
  }
});

app.post("/api/cypher", async (req, res) => {
  const { query, params = {} } = req.body;

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const rows = await runCypher(query, params);
    res.json({ rows });
  } catch (error) {
    res.status(503).json({
      error: "Neo4j query failed",
      detail: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`ReviewGraph AI API listening on http://127.0.0.1:${port}`);
});
