# ADR-004: Aura Agent as the reasoning layer

**Status:** Accepted  
**Date:** 2026-06-02

## Context

Natural-language questions ("Who should review this PR?") require mapping intent to graph queries. Neo4j Aura provides **Text2Cypher**, **parameterized tools**, and optional **LLM explanation** as a managed agent platform.

## Decision

Implement Layer 2 in two complementary ways:

### A. Local reasoning (always available)

- `domains/codereview/questions.js` classifies questions and returns canonical Cypher + in-memory answers.
- `POST /api/ask` executes Cypher on Neo4j when connected.
- No external LLM API key required in the Node app.

### B. Hosted Aura Agent (production)

- `domains/codereview/agent.json` defines system prompt, model (`gemini-2.5-flash`), and nine tools (`explain_pr_risk`, `recommend_reviewers`, `risk_propagation`, `architecture_compliance`, `related_incidents`, `change_impact`, `tightly_coupled_modules`, `reviewgraph_text2cypher`, `similar_concerns`).
- Operators deploy via Aura Console ([aura-console-agent-setup.md](../aura-console-agent-setup.md)) or Agents API.

## Consequences

**Positive**

- Demo works offline; production can add LLM explanations on Aura.
- Tools stay in sync with `questions.js` Cypher templates.

**Negative**

- Local app does not call Gemini/OpenAI directly today — explanation text is template/summary-based unless Aura Agent is used.

**Follow-up**

- Optional LLM post-processor in `POST /api/ask` behind env flag.
