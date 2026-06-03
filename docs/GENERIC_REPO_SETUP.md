# Review any GitHub or GitLab repo (configuration only)

ReviewGraph AI is **generic**: point at a repository with `.env` only. No fork, no domain code changes, no per-repo branches in this codebase.

## Minimal `.env`

### GitHub

```env
NEO4J_URI=neo4j+s://YOUR.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=...

AURA_CLIENT_ID=...
AURA_CLIENT_SECRET=...
AURA_AGENT_INVOKE_URL=https://api.neo4j.io/v2beta1/.../invoke
AURA_AGENT_MODE=primary

SOURCE=github
GITHUB_REPO=owner/repo
GITHUB_TOKEN=ghp_...          # required for ingest (rate limits); write scopes to open PRs from automation
# Fine-grained: Contents + Pull requests (Read and write) on the target repo
AUTO_SYNC_NEO4J=true
```

### GitLab (including self-hosted)

```env
SOURCE=gitlab
GITLAB_PROJECT=group/project
GITLAB_TOKEN=glpat-...
GITLAB_API=https://gitlab.com/api/v4
AUTO_SYNC_NEO4J=true
```

## What happens on `npm run dev`

1. **Ingest** — Fetches merge/pull requests from the API (or a **repository snapshot** if the repo has no PRs yet).
2. **Assess** — Builds the code intelligence graph in memory (files, modules, services, risk).
3. **Sync Neo4j** — Writes the same graph to Aura (`AUTO_SYNC_NEO4J=true`, default when Neo4j is configured).
4. **Ask** — UI and hosted Aura Agent query that graph (credentials stay on the server).

## Optional repo config (in the target repository)

Commit in the **repo being reviewed**, not in ReviewGraph AI:

| File | Purpose |
| --- | --- |
| `docs/reviewgraph-config.json` (preferred), `.reviewgraph.json`, or `.github/reviewgraph.json` | ADRs, forbidden dependencies, incidents, lessons — loaded **in full from the PR head branch** |
| `CODEOWNERS` | Reviewer ownership |

## Rules

- Set **`SOURCE=github`** when using `GITHUB_REPO` so a stray `GITLAB_PROJECT` in your shell does not override `.env`.
- Set **`SOURCE_FALLBACK=false`** if you want ingest errors to surface instead of silently loading demo data.
- Run **`npm run seed`** manually only if you disabled auto-sync (`AUTO_SYNC_NEO4J=false`).

## Aura Agent

The Aura Agent in Console must use the **same Neo4j database** and tools aligned with `domains/codereview/agent.json`. After changing `GITHUB_REPO` or tokens, restart the server (or `POST http://127.0.0.1:4000/api/reload`) so ingest + Neo4j sync run again.

## UI

- Open **`http://127.0.0.1:5173`** (Vite proxies `/api` — avoids CORS).
- Click **Refresh** in the PR sidebar after ingest completes.
- Use **Graph Evidence** zoom/pan to explore the risk subgraph.

## Presentation decks

```bash
npm run decks                    # -> decks/dist/
DECKS_OUT=decks/dist-latest npm run decks   # if dist/ files are open in PowerPoint
```

Includes `04-how-pr-analysis-works.pptx` — recommended for demos and evaluators.
