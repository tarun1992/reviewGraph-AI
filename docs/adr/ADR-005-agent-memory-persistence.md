# ADR-005: Agent memory persistence pattern

**Status:** Accepted  
**Date:** 2026-06-02

## Context

Layer 3 requires remembering **past assessments**, **decisions**, **lessons**, and **incidents** so the agent can answer historical questions, not only describe current graph state.

## Decision

**Read path:** `knowledge()` exposes categories (decisions, lessons, incidents) from the active dataset (demo, ingested, or `.reviewgraph.json`).

**Write path:** `POST /api/assess` → `recordAssessment()`:

1. Always append to an in-memory ring buffer (last 50 assessments).
2. If Neo4j is configured, execute `persistAssessmentCypher` creating:
   - `(:PullRequest)-[:ASSESSED_AS]->(:RiskAssessment)`
   - `(:RiskAssessment)-[:JUSTIFIED_BY]->(:Evidence)-[:CITES]->(...)`

UI **Commit to memory** triggers this write path.

## Consequences

**Positive**

- Works with any Neo4j; survives restarts when persisted.
- Graceful degradation to memory-only store.

**Negative**

- In-memory assessments are lost on restart if Neo4j was not configured.
- No automatic promotion of review comments into long-term lessons yet.

**Follow-up**

- Scheduled jobs to summarize closed MRs into `Lesson` nodes.
