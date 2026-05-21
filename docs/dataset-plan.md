# ReviewGraph AI Dataset Plan

## Best Hackathon Dataset

Use the included sample dataset first, then upgrade it with:

1. Kaggle GitHub Public Pull Request Comments.
2. A parsed local GitHub repository.
3. Optional Kaggle CVE Fix Pairs for security pattern examples.

This gives the project a credible real-world foundation while keeping the demo reliable.

## Why This Graph Matters

The graph is not just storage. It connects review comments to files, files to modules, modules to dependencies, and AI changes to known risk patterns.

That lets the agent explain:

- Why a PR is risky.
- Which module path proves the risk.
- Whether reviewers have complained about similar code before.
- Whether AI-assisted changes resemble known anti-patterns.

## Build Commands

Create the bundled demo CSVs:

```bash
npm run dataset:sample
```

Parse this repo or another local repo:

```bash
npm run dataset:repo -- --path "C:\path\to\repo"
```

Transform a downloaded Kaggle PR comments CSV:

```bash
npm run dataset:kaggle -- --csv "data/raw/github-public-pull-request-comments.csv" --limit 500
```

Output goes to:

```text
data/processed/
```

## Aura Import

1. Create a Neo4j Aura Free instance.
2. Run `npm run dataset:sample`.
3. Push `data/processed/*.csv` to GitHub or another public raw file host.
4. Open Aura Query.
5. Set:

```cypher
:param baseUrl => "https://raw.githubusercontent.com/tarun1992/reviewGraph-AI/main/data/processed/";
```

6. Run [cypher/import_aura.cypher](../cypher/import_aura.cypher).

## Submission Summary

Agent name:

ReviewGraph AI

What it does:

ReviewGraph AI explains pull request risk using graph evidence from code structure, review history, module dependencies, AI-generated changes, and known risk patterns.

Dataset and why graph fits:

The dataset combines GitHub pull request review comments with parsed repository structure. A graph fits because code review risk emerges from relationships: PRs modify files, files belong to modules, modules depend on each other, reviewers comment on files, and AI changes can resemble past risk patterns.

Tools:

- Text2Cypher for natural-language graph questions over pull requests, files, modules, review comments, AI changes, and risk patterns.
- Optional later upgrade: Cypher Template for reliable risk explanations.
- Optional later upgrade: Similarity Search for matching new changes to past review concerns and known risk patterns.
