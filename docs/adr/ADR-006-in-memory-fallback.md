# ADR-006: In-memory fallback without Neo4j

**Status:** Accepted  
**Date:** 2026-06-02

## Context

Developers need to evaluate ReviewGraph AI **before** provisioning Neo4j. CI and laptops may not have a database available.

## Decision

`server/neo4j.js` returns `null` when `NEO4J_URI` / credentials are missing. The application:

- Loads the graph into `domains/codereview/model.js` live bindings (demo or VCS ingest).
- Runs `assess.js` and `questions.js` selectors entirely in RAM.
- Skips Cypher execution on `POST /api/ask` but still returns answers and template Cypher (`neo4j: "fallback"`).
- Reports `/api/health` as `ok: true, neo4j: "fallback"`.

## Consequences

**Positive**

- `npm run dev` works with zero infrastructure.
- Same code paths as production; fewer environment-specific bugs.

**Negative**

- Ask-the-graph does not validate Cypher against a live DB in fallback mode.
- Multi-instance deployments do not share state without Neo4j.

**Follow-up**

- Optional embedded Neo4j for single-binary demos.
