# ReviewGraph AI — Submission

## Agent Name

**ReviewGraph AI**

## What It Does

ReviewGraph AI is an **Aura-powered engineering intelligence agent** for reviewing **AI-written code**. It helps teams understand pull request risk **before merge** by combining:

1. **Code Intelligence Graph** — PRs, files, modules, services, dependencies, review comments, AI changes, and risk patterns in Neo4j.
2. **Aura Agent** — GenAI **Text2Cypher** + LLM explanations over that graph (hosted Aura Agent, proxied securely through the app backend).
3. **Agent Memory** — decisions, lessons, incidents, and persisted risk assessments.

The agent answers questions such as:

- Why is this PR risky?
- Who should review this PR?
- What could break if this merges?
- Does this violate our architecture?
- Has a similar change caused problems before?
- Which services are becoming tightly coupled?

Unlike diff-only AI reviewers, ReviewGraph AI **cites graph evidence** (paths, nodes, relationships) and gives practical merge recommendations.

---

## Dataset and Why a Graph Fits

The dataset models a **code review system**: repositories, pull requests, files, modules, reviewers, review comments, issue types, AI-assisted changes, risk patterns, incidents, ADRs, and team ownership.

Risk in code review is **relationship-driven**:

```text
(PullRequest)-[:MODIFIES]->(File)-[:PART_OF]->(Module)
(Module)-[:DEPENDS_ON]->(Module)
(PullRequest)-[:HAS_REVIEW_COMMENT]->(ReviewComment)-[:MENTIONS]->(IssueType)
(AIChange)-[:INTRODUCED_BY]->(PullRequest)
(AIChange)-[:SIMILAR_TO]->(RiskPattern)-[:CAUSES]->(IssueType)
(Incident)-[:AFFECTED]->(Service)
(Decision)-[:FORBIDS_DEPENDENCY_TO]->(Service)
```

A graph supports dependency cycles, review hotspots, security-sensitive paths, incident history, and architecture rules in **one queryable model**.

**Data sources:** built-in demo, or live **GitHub / GitLab** ingest (credentials in server `.env` only).

---

## Tool Used

**Text2Cypher**

- **Hosted:** Aura Agent in Neo4j Aura Console — natural language → Cypher → graph results → LLM narrative (`domains/codereview/agent.json`).
- **In-app:** `POST /api/ask` → `server/auraAgent.js` (OAuth + invoke) when Aura API keys are configured; falls back to rule-based routing in `domains/codereview/questions.js`.

Canonical tools (same Cypher templates in code and Aura):

| Tool | Purpose |
| --- | --- |
| `recommend_reviewers` | Who should review this PR? |
| `risk_propagation` | What could break if this merges? |
| `architecture_compliance` | ADR / forbidden dependency checks |
| `related_incidents` | Incident-aware review |
| `pull_request_risk_overview` | Why is this PR risky? |

---

## Architecture (summary)

```text
React UI  →  Express API (127.0.0.1:4000)  →  Aura Agent invoke URL
                    ↓                              ↓
              Neo4j Aura DB  ←──────────  Text2Cypher + tools
```

- **Secrets:** `NEO4J_*`, `AURA_CLIENT_*`, `GITHUB_*` / `GITLAB_*` live in **server `.env` only** — never sent to the browser ([docs/SECURITY.md](docs/SECURITY.md)).
- **Features:** reviewer recommendation, risk propagation, architectural compliance, incident-aware reviews ([docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)).

---

## Screenshot — Agent in Aura Console

Add a screenshot of the **ReviewGraph AI** agent in Aura Console (tools, instance, external access enabled).

Suggested path: `docs/screenshots/aura-console-agent.png`

```text
[Insert: Aura Console → Agents → ReviewGraph AI → tools + External access]
```

---

## Screenshot / Demo — Agent in Action

### In-app (live Aura + Neo4j)

The React app **Ask the Graph** tab calls the hosted Aura Agent via the backend. Header shows **Aura Live** and **Neo4j Connected**.

Screenshot included: [`docs/screenshots/app-aura-ask.png`](docs/screenshots/app-aura-ask.png)

**Demo question:**

```text
Why is this PR risky?
```

**Selected PR (demo mode):** `PR-512` (built-in scenario) or **`PR-9`** when `GITHUB_REPO=ma3u/healthgraph-agent` (live ingest — subtle title, Critical risk with graph evidence)

**Example answer themes (from live run):**

- Duplicated authentication logic and circular dependency in security-sensitive components.
- Graph evidence: `PullRequest` → `ReviewComment`, `AIChange`, modified token/user service files.
- Recommendations: consolidate token validation, break dependency cycles, security review before merge.

### Aura Console (optional second screenshot)

Same question in the Aura Console agent playground.

Suggested path: `docs/screenshots/aura-console-ask.png`

---

## How to Reproduce

```bash
git clone <repo>
cd reviewgraph-ai
cp .env.example .env
# Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
# Set AURA_CLIENT_ID, AURA_CLIENT_SECRET, AURA_AGENT_INVOKE_URL
# Optional: GITHUB_REPO / GITLAB_PROJECT + token

npm install
npm run seed
npm run dev
```

Open `http://127.0.0.1:5173` → **Refresh** (re-ingest) → select **PR-9** or **PR-512** → **Risk Assessment** + **Graph Evidence** → **Ask the Graph** → *Why is this PR risky?*

Verify API: `GET http://127.0.0.1:4000/api/health` → `neo4j: connected`, `auraAgent.ready: true`.

---

## Optional Agent Link

Aura external invoke URL is configured in server `.env` (`AURA_AGENT_INVOKE_URL`). Do **not** publish Client Secret.

For evaluators: use the **in-app demo** or request a Console invite to the same Aura project.

```text
<optional: Aura Console project invite or public demo video URL>
```

---

## Repository Map

| Path | Role |
| --- | --- |
| `domains/codereview/` | Graph model, assess, questions, agent.json, ingest |
| `server/auraAgent.js` | Live Aura OAuth + invoke |
| `server/index.js` | API (`/api/ask`, `/api/health`, …) |
| `src/main.jsx` | React UI |
| `docs/ARCHITECTURE.md` | Diagrams |
| `docs/TOKEN_ECONOMICS.md` | Graph vs frontier agents — LLM token cost model |
| `docs/AURA_LIVE_INTEGRATION.md` | Aura setup |
| `docs/aura-console-agent-setup.md` | Console checklist |
| `decks/dist/*.pptx` | Business, technical, getting started decks |

---

## Presentation Decks

Regenerate: `npm run decks` → `decks/dist/` (or `DECKS_OUT=decks/dist-latest npm run decks` if files are open in PowerPoint)

1. `01-business-overview.pptx` — business value and positioning  
2. `02-technical-overview.pptx` — architecture, schema, Aura, configuration  
3. `03-getting-started.pptx` — install, deploy, documentation map  
4. `04-how-pr-analysis-works.pptx` — how PR analysis works + demo script (recommended for evaluators)

---

## Generic repository support

Any GitHub or GitLab repository via `.env` only — see [docs/GENERIC_REPO_SETUP.md](docs/GENERIC_REPO_SETUP.md).

## Team / Notes

Built for the Neo4j Aura Agent challenge: graph-native code review intelligence with explainable, evidence-backed answers for AI-generated changes.
