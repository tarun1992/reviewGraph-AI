# ReviewGraph AI

> **An Aura-powered engineering intelligence agent that combines code relationships, architectural knowledge, and persistent memory to deliver explainable code reviews and impact analysis for AI-written code.**

Most AI reviewers only see the **current diff**. ReviewGraph AI reasons over the *context* a senior engineer actually uses:

```text
Current Diff
  + Architecture (services, modules, dependencies, ADRs)
  + History (similar PRs, past reviews)
  + Incidents (what broke before)
  + Team Knowledge (ownership, expertise)
  + Previous Decisions (risk + architecture rulings)
```

Because code review is fundamentally a **context problem**, not a diff problem — and that gap is widening as more code is written by AI.

> **Start here:** [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for step-by-step usage, and [docs/product-context.md](docs/product-context.md) for the full product vision and graph model.

## The three layers

### Layer 1 — Code Intelligence Graph

The core knowledge graph of the engineering system:

```text
Repository · PR · File · Module · Service · Dependency
ReviewComment · IssueType · RiskPattern · Developer · Team
```

### Layer 2 — Aura Agent (the reasoning layer)

Natural-language questions are answered over the graph:

```text
User Question → Aura Agent → Text2Cypher → Neo4j Graph Query → Graph Results → LLM Explanation
```

### Layer 3 — Agent Memory

Persistent organizational memory so the agent can answer *"have we seen this before?"*, not only *"what exists now?"*:

```text
Past Reviews · Risk Decisions · Architecture Decisions · Incidents · Reviewer Feedback
```

> **Today:** "AuthModule depends on UserModule."
> **With Aura Agent + Memory:** "This dependency pattern appeared in PR-156 and PR-201. Both were later linked to production incidents involving token-validation failures. Security recommended avoiding this coupling in ADR-17."

## Features

| Feature | Question it answers | How the graph answers it |
| --- | --- | --- |
| **Reviewer recommendation** | *Who should review this PR?* | service ownership + prior reviewers of the same files + security sensitivity |
| **Risk propagation** | *What could break if this merges?* | `PR → Files → Modules → Services → Consumers` traversal |
| **Architectural compliance** | *Does this violate our architecture?* | checks introduced dependencies against ADRs / forbidden-dependency decisions |
| **Incident-aware review** | *Has a similar change caused problems before?* | searches incidents, postmortems, and historical PRs |

Every answer follows the same rule: **no verdict without evidence.** Each assessment is built from weighted, graph-cited evidence you can trace back to specific nodes.

## Review any repository (GitHub or GitLab)

No code changes — only credentials in `.env`. ReviewGraph ingests merge/pull requests, changed files, review comments, and CODEOWNERS, then runs the same explainable assessment engine.

| Provider | Required | Optional |
| --- | --- | --- |
| **Demo** (default) | — | built-in `PR-512` scenario |
| **GitHub** | `GITHUB_REPO=owner/name` | `GITHUB_TOKEN`, `GITHUB_PR`, `GITHUB_API` (Enterprise) |
| **GitLab** | `GITLAB_PROJECT=group/project` | `GITLAB_TOKEN`, `GITLAB_MR`, `GITLAB_API` (self-hosted) |

```bash
cp .env.example .env
# GitHub example:
# GITHUB_REPO=myorg/my-service
# GITHUB_TOKEN=ghp_...

# GitLab (GitLab.com or your organization's self-hosted instance):
# GITLAB_PROJECT=mygroup/my-service
# GITLAB_TOKEN=glpat-...
# GITLAB_API=https://gitlab.mycompany.com/api/v4

npm run dev
```

Add a `.reviewgraph.json` at the repo root for architecture rules (ADRs, forbidden dependencies). See [`docs/reviewgraph-config.example.json`](docs/reviewgraph-config.example.json).

Point **any Neo4j** database (Aura, Desktop, Docker) with `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`, then `npm run seed` to persist the ingested graph.

## Quick start

```bash
npm install        # app + deck dependencies
npm run dev        # API on :4000, UI on :5173
```

Without `GITHUB_REPO` or `GITLAB_PROJECT`, the built-in demo opens **`PR-512`**. With a live repo configured, the UI lists that repository's real merge requests. Connect Neo4j Aura when you want to persist memory.

Generate the presentation decks (real `.pptx`):

```bash
npm run decks      # -> decks/dist/01-business-overview.pptx, 02-technical-overview.pptx, 03-getting-started.pptx
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/meta` | Product branding + vocabulary |
| GET | `/api/health` | Neo4j connectivity (or in-memory fallback) |
| GET | `/api/entities` | Pull requests with computed risk score/level |
| GET | `/api/entities/:id` | Explainable assessment + graph-evidence view (incl. recommended reviewers + downstream impact) |
| POST | `/api/ask` | Natural-language question → Text2Cypher answer |
| POST | `/api/assess` | Compute and commit an assessment to agent memory |
| GET | `/api/memory` | Agent memory: decisions, lessons, incidents, recent assessments |
| POST | `/api/cypher` | Run raw Cypher (Neo4j only) |

## Architecture in code

```text
server/index.js             API: /api/meta, /api/entities, /api/ask, /api/assess, /api/memory
server/memoryStore.js       Agent memory (records assessments to Neo4j or in-memory)
server/seed.js              Seed runner
scripts/prepareDataset.js   CSV exporter -> data/processed/codereview/
src/main.jsx                React UI (explainable assessment + graph evidence + agent chat)
decks/build.js              Generates the .pptx decks

domains/codereview/         ReviewGraph AI: model, assess, questions (Text2Cypher),
                            present, knowledge (memory), seed, ingest, agent.json, import.cypher
```

The Aura agent (system prompt + tools: `explain_pr_risk`, `recommend_reviewers`, `risk_propagation`, `architecture_compliance`, `related_incidents`, Text2Cypher) is defined as code in [`domains/codereview/agent.json`](domains/codereview/agent.json).

## Deploy to Neo4j Aura

```bash
cp .env.example .env          # set NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD
npm run seed                  # direct seed via Bolt
npm run dataset               # export CSVs to data/processed/codereview/
# then upload CSVs to a public raw URL and run domains/codereview/import.cypher in Aura
npm run aura:verify
```

## Roadmap

- **Phase 1 — Foundation:** PRs, Files, Modules, Dependencies, Text2Cypher *(done)*
- **Phase 2 — Knowledge:** reviewer knowledge, ADRs, incidents *(done)*
- **Phase 3 — Memory:** agent memory, historical reasoning, learning from reviews *(in progress)*
- **Phase 4 — Autonomy:** autonomous review recommendations, risk scoring, architecture governance

## Example scenario

Open `PR-512`: it reintroduces a `BillingService → AuthService` coupling that was previously reverted in `PR-312` and traced to `Incident-47`. ReviewGraph AI flags it as high risk, **cites all of it**, recommends the right reviewers, and shows which downstream services could break — and that it violates **ADR-7**.
