# Implementation status

What is **implemented and working** in ReviewGraph AI today, and what is **planned**.

---

## Confirmed: generic across VCS and Neo4j

| Capability | Status | Notes |
| --- | --- | --- |
| **Any GitHub repo** | Done | `GITHUB_REPO` + optional token; Enterprise via `GITHUB_API` |
| **Any GitLab project** | Done | GitLab.com or self-hosted via `GITLAB_API` |
| **Any Neo4j (Bolt)** | Done | Aura, Desktop, Docker — `NEO4J_URI` / `USER` / `PASSWORD` |
| **No Neo4j** | Done | In-memory graph; full UI + assessment + ask (Cypher not executed live) |
| **No code change per repo** | Done | Only `.env` + optional `.reviewgraph.json` in target repo |

---

## Layer 1 — Code Intelligence Graph

| Item | Status | Location |
| --- | --- | --- |
| Repository, Team, Developer | Done | Ingested from VCS + CODEOWNERS |
| PullRequest / Merge Request | Done | `sources/github.js`, `sources/gitlab.js` |
| File, Module, Service | Done | Derived from paths + diff imports |
| Module `DEPENDS_ON` edges | Done | Parsed from `+` lines in patches |
| `INTRODUCES_DEPENDENCY` / `FORBIDS_DEPENDENCY_TO` | Done | From `.reviewgraph.json` + diff analysis |
| ReviewComment, historical reviewers | Done | PR/MR comments + review events |
| IssueType, RiskPattern, AIChange | Demo-rich | Full catalog in demo; live repos get heuristics (AI labels, security paths) |
| SecurityFinding | Demo | Demo dataset only |
| Incident, Release, Deployment | Demo | Demo dataset; not auto-ingested from VCS yet |
| Neo4j seed (70+ statements) | Done | `seedStatements.js`, `npm run seed` |
| CSV export for Aura LOAD CSV | Done | `npm run dataset` |

---

## Layer 2 — Aura Agent (reasoning)

| Item | Status | Location |
| --- | --- | --- |
| Text2Cypher-style question router | Done | `domains/codereview/questions.js` |
| Categories: risk, impact, coupling, incidents, ownership, decisions, lessons, similarity | Done | `questions.js` |
| **Reviewer recommendation** | Done | `recommendReviewers()` + `REVIEWERS_CYPHER` |
| **Risk propagation** | Done | `prDownstreamServices()` + `PROPAGATION_CYPHER` |
| **Architectural compliance** | Done | `complianceViolations()` + `COMPLIANCE_CYPHER` |
| **Incident-aware review** | Done | Demo + graph; live repos use ingested incidents if present |
| Agent tools as code | Done | `domains/codereview/agent.json` (9 tools) |
| `POST /api/ask` executes Cypher on Neo4j | Done | `server/index.js` |
| Hosted Aura Agent (Console) | Documented | `docs/aura-console-agent-setup.md` |
| External LLM in local app | Not wired | Aura Console or future integration |

---

## Layer 3 — Agent Memory

| Item | Status | Location |
| --- | --- | --- |
| Decisions, Lessons, Incidents (read) | Done | `knowledge.js`; demo + `.reviewgraph.json` ADRs |
| RiskAssessment + Evidence persistence | Done | `memoryStore.js` → Neo4j when connected |
| Commit assessment from UI | Done | `POST /api/assess` |
| Memory tab | Done | `GET /api/memory` |
| Learning from reviews over time | Partial | Assessments stored; no auto-training loop yet |

---

## Explainable assessment engine

| Item | Status | Location |
| --- | --- | --- |
| Weighted evidence with graph cites | Done | `assess.js` |
| Risk levels (Low / Medium / High / Critical) | Done | `contract.js` `levelForScore()` |
| Impact chips: Services, Teams, Files | Done | `assess.js` |
| Recommended reviewers chip | Done | `assess.js` impacts |
| Downstream services chip | Done | `assess.js` impacts |
| Graph evidence canvas | Done | `present.js` `buildGraph()` |

---

## Data ingestion (pluggable sources)

| Source | Status | Env |
| --- | --- | --- |
| Demo synthetic org | Done | default |
| GitHub REST | Done | `GITHUB_*` |
| GitLab REST | Done | `GITLAB_*` |
| Bitbucket / Azure DevOps | Planned | — |

Shared pipeline: `sources/shared.js` → `buildDatasetFromMergeRequests()` → `model.applyDataset()`.

Startup: `pack.init()` → `initModel()` in `server/index.js`, `server/seed.js`, `scripts/prepareDataset.js`.

---

## API

| Route | Status |
| --- | --- |
| `GET /api/meta` | Done (+ `dataSource`, `repository`) |
| `GET /api/health` | Done |
| `GET /api/entities` | Done |
| `GET /api/entities/:id` | Done |
| `POST /api/ask` | Done |
| `POST /api/assess` | Done |
| `GET /api/memory` | Done |
| `POST /api/cypher` | Done — **disabled unless** `ENABLE_DEV_CYPHER=true` |

---

## UI (React + Vite)

| Feature | Status |
| --- | --- |
| Domain-driven branding from `/api/meta` | Done |
| PR list with risk score / level | Done |
| Assessment + evidence cards | Done |
| Ask the Graph + sample questions | Done |
| Agent Memory tab | Done |
| Live repo badge in header | Done |

---

## Operations & docs

| Item | Status |
| --- | --- |
| `npm run dev` | Done |
| `npm run build` | Done |
| `npm run seed` | Done |
| `npm run dataset` | Done |
| `npm run decks` | Done (4 `.pptx` incl. PR analysis deck) |
| `npm run aura:verify` | Done |
| `npm run aura:vectors` | Done |
| Architecture doc | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Token economics | [TOKEN_ECONOMICS.md](TOKEN_ECONOMICS.md) |
| ADRs | [adr/](adr/) |
| Configuration guide | [CONFIGURATION.md](CONFIGURATION.md) |

---

## Roadmap (not yet implemented)

- Auto-ingest incidents/postmortems from PagerDuty/Jira
- PR bot / CI comment on every MR
- Full LLM explanation in local `POST /api/ask` (today: structured answer + Cypher + rows)
- Vector similarity wired end-to-end in local app (indexes script exists; demo uses lexical fallback)
- Phase 4: autonomous review recommendations, architecture governance policies
