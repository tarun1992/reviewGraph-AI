# ReviewGraph AI

AI-assisted code review intelligence powered by React and Neo4j.

ReviewGraph AI models pull requests, files, services, code smells, anti-patterns, and AI-generated changes as a graph. The demo agent answers review questions with Cypher-backed evidence, helping teams explain architectural risk before merge.

## Features

- React dashboard for PR risk review
- Express API using the Neo4j JavaScript driver
- Seeded hackathon demo dataset
- Text2Cypher-style question routing
- Graph evidence for circular dependencies, coupling, AI impact, and anti-pattern similarity
- Local fallback data when Neo4j is not running

## Run

1. Copy `.env.example` to `.env` and set your Neo4j credentials.
2. Install dependencies:

```bash
npm install
```

3. Seed Neo4j:

```bash
npm run seed
```

4. Start the app:

```bash
npm run dev
```

The frontend runs on `http://127.0.0.1:5173` and the API on `http://127.0.0.1:4000`.

## Dataset and Aura Import

Create Aura-ready CSVs from the bundled hackathon sample:

```bash
npm run dataset:sample
```

Parse a local Git repository into files, modules, imports, and functions:

```bash
npm run dataset:repo -- --path "C:\path\to\repo"
```

Transform the Kaggle GitHub Public Pull Request Comments CSV after downloading it into `data/raw/`:

```bash
npm run dataset:kaggle -- --csv "data/raw/github-public-pull-request-comments.csv" --limit 500
```

Import into Neo4j Aura Free:

1. Push `data/processed/*.csv` to a public raw URL, such as GitHub raw files.
2. In Aura Query, set:

```cypher
:param baseUrl => "https://raw.githubusercontent.com/tarun1992/reviewGraph-AI/main/data/processed/";
```

3. Run [cypher/import_aura.cypher](cypher/import_aura.cypher).

Agent setup notes and tool definitions are in [docs/aura-agent.md](docs/aura-agent.md). For the Free-tier MVP, use the Text2Cypher-only checklist in [docs/aura-console-agent-setup.md](docs/aura-console-agent-setup.md). The dataset plan and submission wording are in [docs/dataset-plan.md](docs/dataset-plan.md).

## Demo Questions

- Why is this PR risky?
- Show modules most affected by AI-generated changes.
- Which services are becoming tightly coupled?
- Is this PR similar to a known anti-pattern?
