# Token economics: graph vs. general-purpose agents

How ReviewGraph AI uses LLM tokens compared with a typical **frontier agent** (e.g. Claude Opus, GPT-4 class models) that reviews code by loading diffs and files into context.

This is a **design and cost-model** document, not a billed benchmark. Actual token counts depend on PR size, agent configuration, and how many questions you ask.

---

## Short answer

| Mode | LLM tokens for core PR risk + evidence |
| --- | --- |
| ReviewGraph — open PR, risk pill, evidence list | **0** (graph traversal in `assess.js`) |
| ReviewGraph — Ask the Graph (local router) | **0** (template Cypher + structured answer) |
| ReviewGraph — Ask the Graph (hosted Aura Agent) | **Small** (Flash-class model + 1–2 tool rounds + compact query results) |
| General Opus-style agent — full PR review | **Large** (diff + file reads + multi-turn reasoning on an expensive model) |

**For the same review questions, a graph-first flow usually spends far fewer LLM tokens** because structure, history, and risk live **outside** the model and you retrieve **slices** of facts. You still pay for **Neo4j / Aura** infrastructure, which a plain chat agent does not need.

---

## Where ReviewGraph spends tokens (and where it does not)

| Step | Uses LLM? | What happens |
| --- | --- | --- |
| GitHub / GitLab ingest | No | REST API → in-memory world model → optional Neo4j sync (`AUTO_SYNC_NEO4J`) |
| Risk score + evidence on the PR page | **No** | `domains/codereview/assess.js` traverses the graph in JavaScript |
| `POST /api/ask` — **local router** | **No** | `domains/codereview/questions.js` classifies the question, runs canonical Cypher, returns a template answer |
| `POST /api/ask` — **Aura Agent** | **Yes** | Hosted agent (`domains/codereview/agent.json`, **Gemini 2.5 Flash**): tool selection → Cypher → small row set → natural-language explanation |
| Aura `invoke` request body | Small fixed prompt | `server/auraAgent.js` sends the question, PR id, optional `graphBrief` (pre-computed score + top signals), and a one-line schema hint — **not** the full diff or repo |

Most of the product is **graph compute**, not **token compute**. That is the main savings lever.

---

## How a general-purpose agent typically spends tokens

A common pattern for “review this PR with Opus”:

```text
System prompt + org rules
+ full or large diff (often 10k–100k+ tokens on big PRs)
+ tool loops (“read these N files”)
+ long reasoning on a frontier model
```

Each new question often **re-loads** overlapping context. There is no stable, queryable `PR → Module → Service → Incident` view unless you build one yourself.

**Cost drivers:** huge input context, multiple turns, high price per token on frontier models.

---

## How ReviewGraph uses the graph instead

```text
Ingest once → graph (nodes, edges, riskScore / riskLevel on PullRequest)
Question → fixed tool Cypher or Text2Cypher
→ tens of rows returned → short explanation
```

Example: *“What could break if this merges?”* does not require the model to read every line of `auth.ts`. Cypher returns service names, teams, downstream consumers, and related incidents — often **hundreds of tokens of results**, not **hundreds of thousands** of source.

The Aura path also injects a **pre-computed assessment brief** (`graphBrief` in `buildAuraAgentInput`) so the agent aligns with the UI score without re-deriving risk from scratch — fewer wrong answers and retry loops.

**Config loading (PR-9 lesson):** GitHub truncates large `reviewgraph-config.json` in diff patches. Ingest fetches the **full file from the PR head branch** via the Contents API. That fixes correctness **without** stuffing the whole JSON into every LLM prompt.

---

## Side-by-side comparison

| Dimension | Graph-first (ReviewGraph) | General agent (Opus-class) |
| --- | --- | --- |
| **Primary context** | Nodes, relationships, pre-scored evidence | Files, diffs, pasted code |
| **Risk score on open PR** | Deterministic graph engine | Usually re-inferred each time |
| **“Who should review?”** | Cypher over ownership + prior comments | Read CODEOWNERS + guess from files |
| **“Similar incident before?”** | Traverse `Incident → Service ← Module ← PR` | Search chat history or re-read docs |
| **Repeat questions on same PR** | Same graph slice; brief prompt | Often re-send large diff |
| **Model tier (this repo)** | Gemini 2.5 Flash via Aura Agent | Often frontier (Opus, etc.) |
| **Infra cost** | Neo4j + optional Aura Agent | API tokens only (unless you add a DB) |

### Order-of-magnitude intuition (not measured in CI)

| Task | Rough token picture |
| --- | --- |
| One Opus PR review with file tools | **50k–200k+** input tokens (scales with PR size) |
| One ReviewGraph graph Q&A (Aura) | **~1k–8k** total across Text2Cypher + explanation (often less with template tools) |
| Open PR + evidence panel only | **0** LLM |

---

## When the graph saves tokens

1. **Deterministic assessment** — Critical/100 and the evidence list cost **zero** LLM tokens.
2. **Bounded retrieval** — Queries return only what the question needs.
3. **Agent memory** — Committed assessments, ADRs, and lessons in Neo4j; later questions cite graph facts instead of re-ingesting narrative history.
4. **Cheaper reasoning model** — Aura Agent uses Flash-class models for NL → tool → explain, not Opus for every hop.
5. **Local demo mode** — Unset Aura env vars → Ask the Graph stays on the local router (**zero** LLM).

---

## When the graph does *not* save tokens (or costs more overall)

| Situation | Why |
| --- | --- |
| You run **both** Opus on the full diff **and** Aura on every click | Duplicate work — highest token spend |
| Aura Agent takes **many tool hops** per question | Each hop is another LLM call |
| Mis-routed **open Text2Cypher** | Extra generation + possible retry |
| You need **line-by-line** semantic review | Graph answers *impact* and *relationships*; literal hunk review still needs a model or human |
| **Platform bill** | Neo4j Aura + Aura Agent are real cost even when LLM tokens are low |

**Total economics:** often **lower token bill, higher graph/platform bill** — the usual trade for RAG and knowledge-graph agents.

---

## Practical guidance for this repository

| Goal | Recommendation |
| --- | --- |
| Minimize tokens in demos | Use built-in or ingested graph only; leave `AURA_CLIENT_ID` unset or `AURA_AGENT_MODE=local` |
| Open-ended NL questions | Enable Aura Agent; one question per PR focus |
| Avoid double spend | Do not stack a full-repo Opus review on top of ReviewGraph for the same PR unless you need line-level critique |
| Align scores | Rely on ingest + `assess.js` + Neo4j sync; Aura gets `graphBrief` on invoke |

Relevant code:

| File | Role |
| --- | --- |
| `domains/codereview/assess.js` | Zero-LLM risk engine |
| `domains/codereview/questions.js` | Zero-LLM local Ask router |
| `server/auraAgent.js` | Compact Aura invoke payload + `graphBrief` |
| `domains/codereview/agent.json` | Hosted tools + model choice |
| `docs/AURA_LIVE_INTEGRATION.md` | Local vs Aura paths |

---

## Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — system layers and data flow
- [AURA_LIVE_INTEGRATION.md](AURA_LIVE_INTEGRATION.md) — when the local router vs hosted agent runs
- [adr/ADR-003-evidence-first-assessment.md](adr/ADR-003-evidence-first-assessment.md) — why scores are graph-cited without an LLM verdict
- [adr/ADR-004-aura-agent-reasoning-layer.md](adr/ADR-004-aura-agent-reasoning-layer.md) — two-path reasoning design
- [product-context.md](product-context.md) — why risk is relationship-driven
