# ReviewGraph AI

## Agent Name

ReviewGraph AI

## What It Does

ReviewGraph AI is an AI code review intelligence agent that helps engineering teams understand pull request risk before merge. It analyzes changed files, review comments, modules, dependency relationships, AI-assisted changes, and known risk patterns.

The agent answers questions like:

- Why is this PR risky?
- Which services are becoming tightly coupled?
- Which files attract the most review concern?
- What risk patterns are linked to AI-assisted changes?

Instead of only flagging issues, ReviewGraph AI explains the graph evidence behind the answer.

## Dataset and Why a Graph Fits

The dataset models a code review system with repositories, pull requests, files, modules, reviewers, review comments, issue types, AI-assisted changes, and risk patterns.

A graph fits naturally because code review risk is relationship-driven. Pull requests modify files, files belong to modules, modules depend on other modules, reviewers comment on files, comments mention issue types, and AI-assisted changes can resemble known risk patterns.

Example graph structure:

```text
(PullRequest)-[:MODIFIES]->(File)
(File)-[:PART_OF]->(Module)
(Module)-[:DEPENDS_ON]->(Module)
(PullRequest)-[:HAS_REVIEW_COMMENT]->(ReviewComment)
(ReviewComment)-[:MENTIONS]->(IssueType)
(AIChange)-[:SIMILAR_TO]->(RiskPattern)
(RiskPattern)-[:CAUSES]->(IssueType)
```

This allows ReviewGraph AI to reason over dependency cycles, review hotspots, security-sensitive changes, and maintainability risks.

## Tool Used

Text2Cypher

ReviewGraph AI uses Text2Cypher to convert natural-language review questions into Cypher queries over the Neo4j Aura graph.

## Screenshot of Agent in Aura Console

Add screenshot here showing the ReviewGraph AI agent configuration in Aura Console.

```text
<insert Aura Console agent screenshot>
```

## Screenshot or Short Demo of Agent in Action

Add screenshot or demo clip showing the agent answering:

```text
Why is PR-184 risky?
```

Recommended answer to capture:

```text
PR-184 is risky because it modifies authentication-sensitive files, affects AuthModule, UsersModule, and TokensModule, and is connected to dependency cycles across core identity modules. Review comments also flag duplicated token validation and security-sensitive coupling.
```

## Optional Agent Link

Add your published Aura Agent link here if available:

```text
<agent link>
```

