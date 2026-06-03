# Live Aura & Text2Cypher integration

What works in this app vs Aura Console-only setup.

---

## Summary

| Capability | Local router (`questions.js`) | Aura Agent in app (`server/auraAgent.js`) | Aura Console |
| --- | --- | --- | --- |
| **Live Neo4j** | Yes — when `NEO4J_URI` is set | Yes — same database via agent tools | Yes |
| **NL → Cypher** | Rule-based templates | GenAI Text2Cypher (LLM) | Same as in-app |
| **LLM explanation** | Structured template text | Yes — final `text` blocks | Yes |
| **Where you ask** | React **Ask the Graph** | Same tab (when Aura env is set) | Separate Console UI |

---

## Aura Console agent must match the repo

Update tools in Aura Console from `domains/codereview/agent.json` (especially `explain_pr_risk`). After each ingest, Neo4j `PullRequest` nodes get `riskScore`, `riskLevel`, and `hasGraphRisk`.

Even before you update Console, the API injects the **local graph assessment** into every Aura question and prepends engine evidence to the answer so scores align with the UI.

---

## Path A — Local router (default)

When Aura env vars are **not** set (or `AURA_AGENT_MODE=local`):

1. `POST /api/ask` classifies the question in `domains/codereview/questions.js`.
2. Picks a canonical Cypher template.
3. Runs Cypher on Neo4j when configured.
4. Returns `{ source: "local", answer, cypher, rows }`.

---

## Path B — Hosted Aura Agent in the app (recommended for open-ended questions)

### 1. Prerequisites

- Neo4j Aura (or any Bolt DB) seeded: `npm run seed`
- An Aura Agent in **Aura Console** pointed at the **same** database, with tools from [`domains/codereview/agent.json`](../domains/codereview/agent.json) — see [aura-console-agent-setup.md](aura-console-agent-setup.md)

### 2. Enable external invoke

1. Aura Console → **Agents** → your agent.
2. Turn on **External access**.
3. Copy the **invoke URL** (ends with `/invoke`).
4. **Account → API Keys** → create keys → `AURA_CLIENT_ID` / `AURA_CLIENT_SECRET`.

### 3. `.env`

```env
NEO4J_URI=neo4j+s://YOUR_INSTANCE.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=...

AURA_CLIENT_ID=...
AURA_CLIENT_SECRET=...
AURA_AGENT_INVOKE_URL=https://api.neo4j.io/v2beta1/organizations/.../agents/.../invoke
AURA_AGENT_MODE=primary
```

| Variable | Purpose |
| --- | --- |
| `AURA_CLIENT_ID` / `AURA_CLIENT_SECRET` | OAuth client credentials (`POST https://api.neo4j.io/oauth/token`) |
| `AURA_AGENT_INVOKE_URL` | Agent invoke endpoint from Console |
| `AURA_AGENT_MODE` | `primary` (default when URL set), `local` (force router), `off` |
| `AURA_AGENT_TIMEOUT_MS` | Invoke timeout (default `120000`) |

### 4. Run

```bash
npm run dev
```

- Header shows **Aura ready** when OAuth succeeds (`GET /api/health` → `auraAgent.ready`).
- **Ask the Graph** uses Aura when `mode=primary`; on failure it falls back to the local router and shows `auraError`.

### 5. API shape

```bash
curl -X POST http://127.0.0.1:4000/api/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"Who should review this PR?\",\"entityId\":\"PR-512\"}"
```

Response (Aura):

```json
{
  "source": "aura_agent",
  "title": "Aura Agent answer",
  "answer": "...",
  "reasoning": ["..."],
  "evidence": ["..."],
  "cypher": "// Aura tool: ...",
  "aura": { "status": "SUCCESS", "endReason": "FINAL_ANSWER_PROVIDED" }
}
```

The server enriches the selected PR id into the agent `input` so answers stay PR-scoped.

---

## Implementation notes

- `server/auraAgent.js` — OAuth token cache, invoke, parse `content[]` (`text`, `thinking`, tool use/result). Credentials never leave the server.
- `server/index.js` — `/api/ask` prefers Aura when enabled; `/api/meta` and `/api/health` expose only `{ enabled, mode, ready }` (no invoke URL or secrets).
- `server/clientSafe.js` — sanitizes API responses for the browser.
- UI — source badge (Aura vs local), optional reasoning panel. Configure Aura in server `.env` only — see [SECURITY.md](SECURITY.md).

---

## Related

- [CONFIGURATION.md](CONFIGURATION.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [aura-console-agent-setup.md](aura-console-agent-setup.md)
- [aura-agent.md](aura-agent.md)
