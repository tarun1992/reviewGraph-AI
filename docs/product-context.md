# ReviewGraph AI - Product Context

> The canonical foundation document for ReviewGraph AI. Read this before writing
> new code. It defines the product vision, the knowledge graph, and the Agent
> Memory layer that the rest of the system is built to serve.

---

## One-Sentence Positioning

> ReviewGraph AI is a graph-native engineering intelligence platform that
> combines code relationships, organizational knowledge, and persistent memory
> to deliver explainable, context-aware code review and architectural reasoning.

---

## Vision

ReviewGraph AI is an AI-native code review intelligence platform that helps
engineering teams understand the architectural, operational, and business impact
of code changes.

Unlike traditional code review tools that analyze files or diffs in isolation,
ReviewGraph AI builds a continuously evolving graph of software systems, code
reviews, engineering knowledge, and organizational memory.

The platform acts as an engineering reviewer that remembers past decisions,
understands architectural dependencies, learns from historical incidents, and
explains risk through evidence.

---

## Problem Statement

AI-assisted coding is dramatically increasing software development velocity.
Faster code generation creates new challenges:

- Increased review volume
- Hidden dependency risks
- Architecture drift
- Duplicate implementations
- Security regressions
- Knowledge silos
- Loss of historical context
- Reviewer fatigue

Current review tools focus on syntax, linting, and static analysis. They rarely
answer:

- Have we seen this pattern before?
- Did a similar change cause an incident?
- Which architectural decisions are affected?
- Which teams are impacted?
- Why is this risk important?

ReviewGraph AI addresses these questions using graph reasoning and persistent
memory.

---

## Core Philosophy

Software systems are graphs. Every engineering artifact is connected.

```text
Developer -> Pull Request -> Files -> Modules -> Services
          -> Dependencies -> Infrastructure -> Incidents -> Business Capabilities
```

**Risk emerges from relationships, not individual files.**

---

## Product Mission

Help teams answer **"What is the real impact of this change?"** before code
reaches production.

---

## Key Differentiator

Traditional AI code review:

```text
Diff -> LLM -> Comments
```

ReviewGraph AI:

```text
Diff
 -> Knowledge Graph
 -> Historical Memory
 -> Dependency Analysis
 -> Incident Intelligence
 -> LLM Reasoning
 -> Explainable Risk Assessment
```

---

## Knowledge Domains

The graph continuously connects the following domains.

| Domain | Concepts |
| --- | --- |
| Source Code | Repositories, Branches, Files, Classes, Functions, APIs, Services |
| Engineering Process | Pull Requests, Reviews, Comments, Review Decisions, Approvals, Rejections |
| Architecture | Modules, Components, Service Boundaries, Dependencies, Data Flows |
| Operations | Deployments, Releases, Incidents, Postmortems, Outages |
| Security | Vulnerabilities, Security Findings, Compliance Issues |
| People | Developers, Reviewers, Teams, Ownership |
| Organizational Knowledge | ADRs, RFCs, Design Documents, Coding Standards, Team Guidelines |

---

## Knowledge Graph Schema

This section is the bridge between vision and code. It separates what is
**implemented today** from the **target** graph the vision requires, so future
work can extend the graph incrementally without breaking the foundation.

### Layer 1 - Implemented today (MVP)

This is the canonical schema currently created by
[`domains/codereview/import.cypher`](../domains/codereview/import.cypher) and used
by the Aura agent in [`docs/aura-agent.md`](aura-agent.md).

> **Note:** the implementation lives under [`domains/codereview/`](../domains/codereview/)
> (model, assessment engine, Text2Cypher, agent memory, and `agent.json`). For
> how to run and extend it, see [`docs/GETTING_STARTED.md`](GETTING_STARTED.md).

Node labels: `Repository`, `PullRequest`, `File`, `Module`, `Function`,
`Reviewer`, `ReviewComment`, `IssueType`, `RiskPattern`, `AIChange`.

```text
(:Repository)-[:HAS_PR]->(:PullRequest)
(:PullRequest)-[:MODIFIES]->(:File)
(:PullRequest)-[:HAS_REVIEW_COMMENT]->(:ReviewComment)
(:Reviewer)-[:WROTE]->(:ReviewComment)
(:ReviewComment)-[:ON_FILE]->(:File)
(:ReviewComment)-[:MENTIONS]->(:IssueType)
(:File)-[:PART_OF]->(:Module)
(:File)-[:IMPORTS]->(:File)
(:File)-[:DEFINES]->(:Function)
(:Module)-[:DEPENDS_ON]->(:Module)
(:AIChange)-[:INTRODUCED_BY]->(:PullRequest)
(:AIChange)-[:TOUCHES]->(:File)
(:AIChange)-[:SIMILAR_TO]->(:RiskPattern)
(:RiskPattern)-[:CAUSES]->(:IssueType)
```

> The fallback API and the Neo4j seed are both derived from a single canonical
> world model ([`domains/codereview/model.js`](../domains/codereview/model.js)),
> so the running app and the database always agree on this schema.

### Layer 2 - Target domain graph (vision)

These labels extend the MVP to cover all knowledge domains. They are additive:
existing labels keep their meaning and new edges connect into them.

```text
# Source code & architecture
(:Repository)-[:HAS_BRANCH]->(:Branch)
(:File)-[:DEFINES]->(:Class)-[:DECLARES]->(:Function)
(:File)-[:EXPOSES]->(:API)
(:Module)-[:PART_OF]->(:Service)
(:Service)-[:DEPENDS_ON]->(:Service)
(:Service)-[:HAS_BOUNDARY]->(:Component)

# Engineering process
(:PullRequest)-[:HAS_REVIEW]->(:Review)
(:Review)-[:DECIDED]->(:ReviewDecision)   # APPROVED | REJECTED | CHANGES_REQUESTED

# Operations
(:PullRequest)-[:SHIPPED_IN]->(:Release)
(:Release)-[:DEPLOYED_BY]->(:Deployment)
(:Deployment)-[:TARGETS]->(:Service)
(:Incident)-[:IMPACTED]->(:Service)
(:Incident)-[:DOCUMENTED_BY]->(:Postmortem)
(:Incident)-[:TRACED_TO]->(:PullRequest)

# Security
(:Vulnerability)-[:AFFECTS]->(:File)
(:SecurityFinding)-[:RAISED_ON]->(:PullRequest)
(:ComplianceIssue)-[:VIOLATES]->(:Standard)

# People & ownership
(:Developer)-[:AUTHORED]->(:PullRequest)
(:Developer)-[:MEMBER_OF]->(:Team)
(:Team)-[:OWNS]->(:Service)
(:Developer)-[:EXPERT_IN]->(:Module)

# Organizational knowledge
(:ADR)-[:GOVERNS]->(:Service)
(:RFC)-[:PROPOSES]->(:ADR)
(:DesignDoc)-[:DESCRIBES]->(:Component)
(:Standard)-[:APPLIES_TO]->(:Module)
```

### Layer 3 - Agent Memory graph

See the next section. The memory layer (`Decision`, `RiskAssessment`, `Lesson`)
sits on top of Layers 1 and 2 and is what makes reviews context-aware over time.

---

## Agent Memory Layer

The system does not only store facts. It stores **decisions**, **reasoning**, and
**lessons learned**, and links them back into the graph so future reviews can
reference them.

### Decisions

```text
AuthService token validation
 -> Architecture Decision
 -> JWT-only validation policy
```

Modeled as:

```text
(:Decision {summary, policy, status, decidedAt})
(:Decision)-[:ABOUT]->(:Service)
(:Decision)-[:RECORDED_IN]->(:ADR)
(:Decision)-[:SUPERSEDES]->(:Decision)
```

### Reasoning

```text
PR-492
 -> Risk = High
 -> Because: dependency cycle, security-sensitive module, previous incident similarity
```

Modeled as:

```text
(:RiskAssessment {level, score, createdAt})
(:PullRequest)-[:ASSESSED_AS]->(:RiskAssessment)
(:RiskAssessment)-[:JUSTIFIED_BY]->(:Evidence)
(:Evidence)-[:CITES]->(:File | :Module | :Incident | :RiskPattern)
```

Every assessment must be **traceable**: each `RiskAssessment` links to the exact
graph paths (`Evidence -> CITES`) that justify it. No verdict without evidence.

### Lessons Learned

```text
Incident-108
 -> Root Cause: Circular dependency
 -> Mitigation: Review checklist update
```

Modeled as:

```text
(:Lesson {statement, createdAt})
(:Incident)-[:PRODUCED]->(:Lesson)
(:Lesson)-[:RECOMMENDS]->(:Standard | :Checklist)
(:Lesson)-[:APPLIES_TO]->(:Module | :Service | :RiskPattern)
```

Future reviews query the memory layer first: *have we already learned something
relevant to this change?*

---

## Long-Term Product Workflow

1. **Developer opens a PR.**
2. **ReviewGraph builds context** - collects changed files, service ownership,
   dependency graph, related ADRs, similar historical PRs, and previous
   incidents.
3. **Agent performs graph reasoning** - What systems are affected? Which teams
   are impacted? Have we seen this pattern before? Does this violate
   architectural constraints?
4. **Agent generates an explanation**, for example:

   > This change introduces a dependency from BillingService to AuthService.
   > Similar coupling introduced in PR-312 contributed to Incident-47 and was
   > later reverted.

---

## Future Enterprise Features

| Feature | Description |
| --- | --- |
| Architectural Drift Detection | Detect when systems gradually violate intended architecture. |
| Reviewer Recommendation | Suggest reviewers by expertise, historical ownership, and incident involvement. |
| Incident Prediction | Estimate risk from similar changes, historical failures, and dependency propagation. |
| Knowledge Discovery | Answer "Why does this service exist?" and "Who understands this subsystem?" |
| Engineering Copilot | Answer "What could break if I modify this API?" |

---

## Ideal End State

ReviewGraph AI becomes an **Engineering Memory System** - not just a code review
tool. A platform that understands code, architecture, teams, decisions,
incidents, and business context, and continuously learns from every engineering
action.

---

## Current State vs. Target (Gap Map)

A pragmatic view of where the codebase is today relative to the vision, to guide
prioritization.

| Capability | Today | Target |
| --- | --- | --- |
| Code & review graph | Implemented (Layer 1) | Stable foundation |
| Text2Cypher Q&A | Implemented (canonical schema) | Add managed LLM-backed Text2Cypher |
| Similarity / embeddings | Lexical fallback + vector indexes prepared | Wire real embeddings end to end |
| Operations graph (incidents, deploys) | Implemented (Layer 2) | Ingest from real incident tooling |
| People / ownership graph | Implemented (Layer 2) | Sync from org directory / CODEOWNERS |
| Org knowledge (ADRs, decisions) | Implemented (Layer 2/3) | Ingest from ADR repos |
| Agent Memory (decisions, assessments, lessons) | Implemented (Layer 3) | Auto-learn lessons from new incidents |
| Explainable risk with cited evidence | Implemented (`riskEngine`) | Tune weights from outcomes |

**Status:** Layers 1-3 are now implemented end to end. The risk engine produces
evidence-cited assessments, and the agent memory layer persists decisions,
lessons, and committed assessments. Remaining work is about replacing seeded
data with live ingestion (incident tooling, org directory, ADR repos) and
training the risk weights on real review outcomes.
