# Architecture Decision Records (ADRs)

This folder documents **decisions made while building ReviewGraph AI** (the product/platform). These are separate from **ADR nodes in the knowledge graph**, which represent *your organization's* architecture rules (declared in each repo's `.reviewgraph.json`).

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-neo4j-knowledge-graph.md) | Neo4j as the knowledge graph store | Accepted |
| [ADR-002](ADR-002-pluggable-vcs-sources.md) | Pluggable VCS sources (GitHub and GitLab) | Accepted |
| [ADR-003](ADR-003-evidence-first-assessment.md) | Evidence-first explainable assessments | Accepted |
| [ADR-004](ADR-004-aura-agent-reasoning-layer.md) | Aura Agent as the reasoning layer | Accepted |
| [ADR-005](ADR-005-agent-memory-persistence.md) | Agent memory persistence pattern | Accepted |
| [ADR-006](ADR-006-in-memory-fallback.md) | In-memory fallback without Neo4j | Accepted |

## Format

Each ADR follows:

- **Context** — forces at play
- **Decision** — what we chose
- **Consequences** — trade-offs and follow-ups

## Repo-level ADRs (customer repositories)

Teams declare architecture rules for **their** services in `.reviewgraph.json` at the repository root. Example: [reviewgraph-config.example.json](../reviewgraph-config.example.json).

Those rules become `Decision` and `ADR` nodes in the graph and power **architectural compliance** checks during review.
