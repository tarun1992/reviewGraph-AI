# ADR-001: Neo4j as the knowledge graph store

**Status:** Accepted  
**Date:** 2026-06-02

## Context

Code review is a **relationship problem**: pull requests touch files, files belong to modules, modules depend on each other, teams own services, and past incidents link to the same subgraph. Tabular stores make multi-hop questions ("what breaks if this merges?") expensive and obscure.

ReviewGraph AI must support **any** deployment environment — cloud Aura, on-prem Desktop, or demo without a database.

## Decision

Use **Neo4j** as the canonical graph store, accessed via the **Bolt** protocol (`neo4j-driver`). The schema (labels and relationship types) is defined in `domains/codereview/schema.js` and populated by `seedStatements()`.

Connection is configured only through environment variables:

- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, optional `NEO4J_DATABASE`

No Neo4j-specific features are required beyond Cypher and constraints; the app does not hard-code Aura.

## Consequences

**Positive**

- Native graph traversals for reviewer recommendation, risk propagation, and compliance.
- Same codebase works against Aura, self-hosted Neo4j, and local Desktop.
- Aligns with Neo4j Aura Agent (Text2Cypher, tools) for production deployments.

**Negative**

- Operators must provision and secure a graph database for production.
- Schema migrations are manual (seed wipes domain labels on re-seed).

**Follow-up**

- Incremental ingest / CDC from VCS webhooks (not in MVP).
