# Technical architecture

ReviewGraph AI is an **Aura-powered engineering intelligence agent** for reviewing AI-written code. It combines a **Code Intelligence Graph** (Neo4j), a **reasoning layer** (Text2Cypher + tools), and **Agent Memory** (persistent assessments and organizational knowledge).

This document is the detailed technical reference. For **where to enter credentials**, see [CONFIGURATION.md](CONFIGURATION.md). For **what is built**, see [IMPLEMENTATION.md](IMPLEMENTATION.md).

---

## 1. System context

```mermaid
flowchart TB
  subgraph users [Users]
    Dev[Developer / Reviewer]
  end

  subgraph vcs [Version control - any org]
    GH[GitHub.com / Enterprise]
    GL[GitLab.com / Self-hosted]
  end

  subgraph reviewgraph [ReviewGraph AI application]
    UI[React UI :5173]
    API[Express API :4000]
    Engine[Assessment + Text2Cypher engine]
    Ingest[GitHub / GitLab adapters]
  end

  subgraph data [Graph storage - any Neo4j]
    Aura[(Neo4j Aura)]
    Local[(Neo4j Desktop / Docker)]
    Mem[(In-memory fallback)]
  end

  subgraph aura_cloud [Neo4j Aura platform - optional]
    AuraAgent[Hosted Aura Agent + LLM]
  end

  Dev --> UI
  UI --> API
  API --> Engine
  API --> Ingest
  Ingest --> GH
  Ingest --> GL
  Engine --> Aura
  Engine --> Local
  Engine --> Mem
  AuraAgent --> Aura
  Dev -.->|optional chat| AuraAgent
```

**Generic boundaries:**

- **VCS:** GitHub *or* GitLab (same canonical graph after ingest).
- **Neo4j:** Any Bolt endpoint; optional — without it, the engine uses RAM.
- **Aura Agent:** Optional hosted agent on Aura; local app implements the same tools without an external LLM.

---

## 2. Three-layer model

```mermaid
flowchart LR
  subgraph L1 [Layer 1 - Code Intelligence Graph]
    PR[PullRequest]
    File[File]
    Mod[Module]
    Svc[Service]
    Dev[Developer]
    RC[ReviewComment]
  end

  subgraph L2 [Layer 2 - Aura Agent reasoning]
    Q[User question]
    T2C[Text2Cypher / tool router]
    Cyp[Cypher execution]
    Exp[Explanation - hosted Aura LLM optional]
  end

  subgraph L3 [Layer 3 - Agent Memory]
    Dec[Decision / ADR]
    Les[Lesson]
    Inc[Incident]
    RA[RiskAssessment + Evidence]
  end

  PR --> File --> Mod --> Svc
  PR --> RC
  Q --> T2C --> Cyp --> L1
  Cyp --> Exp
  L1 --> L3
  RA --> L3
```

| Layer | Stored as | Purpose |
| --- | --- | --- |
| **L1** | Neo4j nodes/relationships | What changed, who owns it, how code connects |
| **L2** | Stateless logic + `agent.json` | Answer questions with graph-backed reasoning |
| **L3** | Neo4j + in-memory buffer | “Have we seen this before?” — decisions, lessons, committed assessments |

---

## 3. Deployment architecture

```mermaid
flowchart TB
  subgraph env [Configuration .env]
    SRC[SOURCE / GITHUB_* / GITLAB_*]
    NEO[NEO4J_URI / USER / PASSWORD]
    PORT[PORT]
  end

  subgraph startup [Startup sequence]
    Load[loadDomainPack]
    Init[pack.init → initModel]
    GHsrc[sources/github.js]
    GLsrc[sources/gitlab.js]
    Demo[sources/demo.js]
    Apply[applyDataset → model store]
  end

  subgraph runtime [Runtime]
    Listen[Express listen]
    Meta[/api/meta]
    Ask[/api/ask]
    Assess[/api/assess]
  end

  env --> Load
  Load --> Init
  Init -->|SOURCE=github| GHsrc
  Init -->|SOURCE=gitlab| GLsrc
  Init -->|SOURCE=demo| Demo
  GHsrc --> Apply
  GLsrc --> Apply
  Demo --> Apply
  Apply --> Listen
  Listen --> Meta
  Listen --> Ask
  Listen --> Assess
  NEO --> Ask
  NEO --> Assess
```

**Entry point:** `server/index.js` loads `domains/codereview/pack.js`, calls `pack.init()`, then serves the API.

---

## 4. Data ingestion pipeline

```mermaid
sequenceDiagram
  participant Env as .env
  participant Init as initModel
  participant Adapter as GitHub or GitLab adapter
  participant Shared as sources/shared.js
  participant Model as model.js store
  participant Seed as npm run seed
  participant Neo4j as Neo4j DB

  Env->>Init: GITHUB_REPO or GITLAB_PROJECT
  Init->>Adapter: load*Dataset()
  Adapter->>Adapter: REST: project, MRs/PRs, diffs, notes, CODEOWNERS
  Adapter->>Adapter: fetch .reviewgraph.json
  Adapter->>Shared: buildDatasetFromMergeRequests()
  Shared->>Shared: paths → Module → Service
  Shared->>Shared: diff imports → DEPENDS_ON
  Shared->>Shared: CODEOWNERS → Team ownership
  Shared->>Model: applyDataset()
  Note over Model: pullRequests, files, evidence graph in RAM
  Seed->>Model: read live bindings
  Seed->>Neo4j: seedStatements() 70+ Cypher steps
```

### Canonical merge request shape (VCS-agnostic)

Both adapters produce the same structure before `buildDatasetFromMergeRequests()`:

| Field | GitHub source | GitLab source |
| --- | --- | --- |
| `iid` | PR `number` | MR `iid` |
| `files[].patch` | `pulls/{n}/files` | `merge_requests/{iid}/changes` |
| `comments` | Review comments on path | MR notes with `position.new_path` |
| `reviewerLogins` | Submitted reviews | Note authors |
| Ownership | CODEOWNERS file | CODEOWNERS / `.gitlab/CODEOWNERS` |

---

## 5. Graph schema (Layer 1 + 3)

```mermaid
erDiagram
  Repository ||--o{ PullRequest : HAS_PR
  PullRequest ||--o{ File : MODIFIES
  File ||--|| Module : PART_OF
  Module ||--|| Service : IN_SERVICE
  Module ||--o{ Module : DEPENDS_ON
  File ||--o| Service : INTRODUCES_DEPENDENCY
  Developer ||--o{ PullRequest : AUTHORED
  Developer ||--o{ ReviewComment : WROTE
  PullRequest ||--o{ ReviewComment : HAS_REVIEW_COMMENT
  ReviewComment ||--|| File : ON_FILE
  Team ||--o{ Service : OWNS
  Developer ||--o{ Team : MEMBER_OF
  Decision ||--o{ Service : ABOUT
  Decision ||--o| Service : FORBIDS_DEPENDENCY_TO
  Decision ||--o| ADR : RECORDED_IN
  Incident ||--o{ Service : IMPACTED
  Incident ||--o| PullRequest : TRACED_TO
  Lesson ||--o{ Module : APPLIES_TO
  PullRequest ||--o{ RiskAssessment : ASSESSED_AS
  RiskAssessment ||--o{ Evidence : JUSTIFIED_BY
  Evidence ||--o{ File : CITES
```

Authoritative labels: [`domains/codereview/schema.js`](../domains/codereview/schema.js).

---

## 6. Assessment flow (explainable risk)

```mermaid
flowchart TD
  Start[GET /api/entities/:id or assess on list]
  Load[Load PR from model store]
  Traverse[Traverse PR → Files → Modules → Services]
  Signals[Collect evidence signals]
  S1[Security-sensitive files]
  S2[Security findings]
  S3[AI risk patterns]
  S4[Dependency cycles]
  S5[Coupling regressions]
  S6[Similar PRs / incidents]
  S7[Lessons / cross-team]
  Weight[Sum weighted evidence + baseRiskScore]
  Level[levelForScore → Critical/High/Medium/Low]
  Impacts[Build impacts: services, teams, reviewers, downstream]
  Out[Assessment JSON + graph view]

  Start --> Load --> Traverse --> Signals
  Signals --> S1 & S2 & S3 & S4 & S5 & S6 & S7
  S1 & S2 & S3 & S4 & S5 & S6 & S7 --> Weight --> Level --> Impacts --> Out
```

**Rule:** no verdict without evidence — every score cites graph nodes (`cite()` in `server/domain/contract.js`).

Implementation: [`domains/codereview/assess.js`](../domains/codereview/assess.js).

---

## 7. Ask the Graph (Layer 2 — local Aura Agent)

```mermaid
sequenceDiagram
  participant UI as React Ask tab
  participant API as POST /api/ask
  participant Q as questions.js
  participant Neo as Neo4j
  participant Mem as In-memory model

  UI->>API: question + entityId
  API->>Q: answerQuestion()
  Q->>Q: classifyQuestion → category
  Q->>Q: builder → answer + cypher
  alt Neo4j connected
    API->>Neo: runCypher(cypher, {prId})
    Neo-->>API: rows
  else fallback
    API->>Mem: answer already from model selectors
  end
  API-->>UI: answer, evidence, cypher, rows, neo4j status
```

### Question categories → tools

| Category | Example question | Aura tool name |
| --- | --- | --- |
| `risk` | Why is this PR risky? | `explain_pr_risk` |
| `reviewers` | Who should review this PR? | `recommend_reviewers` |
| `propagation` | What could break if this merges? | `risk_propagation` |
| `compliance` | Does this violate our architecture? | `architecture_compliance` |
| `incidents` | Has this caused problems before? | `related_incidents` |
| `impact` | What is the impact? | `change_impact` |
| `coupling` | Which modules are tightly coupled? | `tightly_coupled_modules` |
| *open* | Any other NL question | `reviewgraph_text2cypher` |

Agent definition: [`domains/codereview/agent.json`](../domains/codereview/agent.json).

---

## 8. Aura Agent integration (hosted)

```mermaid
flowchart LR
  subgraph local [ReviewGraph repo]
    AJ[agent.json]
    Cypher[Tool Cypher templates]
    Doc[aura-console-agent-setup.md]
  end

  subgraph aura [Neo4j Aura tenant]
    Console[Aura Console]
    Agent[ReviewGraph AI Agent]
    LLM[Gemini / configured model]
    DB[(AuraDB instance)]
  end

  AJ --> Console
  Cypher --> Agent
  Doc --> Console
  Agent --> LLM
  Agent --> DB
  User[Engineer] --> Agent
```

**Steps:**

1. Configure `.env` Neo4j credentials → `npm run seed`.
2. In Aura Console: create agent from prompt; add tools from `agent.json`.
3. Enable GenAI + tool authentication ([checklist](aura-console-agent-setup.md)).
4. Chat in Aura UI or invoke via Agents API / MCP.

The **local app** does not require the hosted agent to function; it implements the same graph queries directly.

---

## 9. Agent memory write path

```mermaid
sequenceDiagram
  participant UI as UI Commit to memory
  participant API as POST /api/assess
  participant Assess as assess.js
  participant Store as memoryStore.js
  participant Neo as Neo4j

  UI->>API: entityId
  API->>Assess: assessPullRequest()
  Assess-->>API: Assessment + evidence
  API->>Store: recordAssessment()
  Store->>Store: in-memory ring buffer
  alt Neo4j configured
    Store->>Neo: persistAssessmentCypher
  end
  API-->>UI: persisted neo4j | memory
```

---

## 10. Component map

| Path | Responsibility |
| --- | --- |
| `server/index.js` | HTTP API, orchestration |
| `server/neo4j.js` | Bolt driver (any Neo4j) |
| `server/memoryStore.js` | Layer 3 assessment persistence |
| `server/domain/loader.js` | Load `domains/codereview/pack.js` |
| `domains/codereview/pack.js` | Pack contract + `init()` |
| `domains/codereview/model.js` | Pluggable graph store + selectors |
| `domains/codereview/sources/github.js` | GitHub ingest |
| `domains/codereview/sources/gitlab.js` | GitLab ingest |
| `domains/codereview/sources/shared.js` | VCS → canonical dataset |
| `domains/codereview/sources/demo.js` | Synthetic demo org |
| `domains/codereview/assess.js` | Explainable risk engine |
| `domains/codereview/questions.js` | Text2Cypher routing |
| `domains/codereview/present.js` | UI list + graph canvas |
| `domains/codereview/seedStatements.js` | Neo4j seed |
| `domains/codereview/agent.json` | Aura Agent tools (as code) |
| `src/main.jsx` | React UI |
| `decks/build.js` | Presentation generator |

---

## 11. Security notes

- Store **tokens and Neo4j passwords** only in `.env` (never commit `.env`).
- GitLab uses `PRIVATE-TOKEN`; GitHub uses `Bearer` token.
- Private repos require tokens with read access to merge requests and repository content.
- Aura tool authentication is configured in Aura Console per instance.

---

## Related documents

- [CONFIGURATION.md](CONFIGURATION.md) — all credentials and entry points
- [IMPLEMENTATION.md](IMPLEMENTATION.md) — feature checklist
- [adr/README.md](adr/README.md) — architecture decision records
- [GETTING_STARTED.md](GETTING_STARTED.md) — tutorials
- [product-context.md](product-context.md) — product vision
