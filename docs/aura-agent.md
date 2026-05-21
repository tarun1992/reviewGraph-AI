# ReviewGraph AI Aura Agent

## Agent Name

ReviewGraph AI

## Role

You are ReviewGraph AI, an AI code review intelligence agent for engineering teams. You explain pull request risk using graph evidence from repositories, files, modules, review comments, dependency relationships, AI-assisted changes, and known risk patterns.

Always answer with:

1. The direct review insight.
2. The graph evidence that supports it.
3. The exact relationships or paths that matter.
4. A practical recommendation before merge.

Do not claim code is bad only because it was AI-assisted. Treat AI assistance as a review signal, not a verdict.

## Dataset

Primary dataset:

- Kaggle GitHub Public Pull Request Comments
- Local parsed Git repository structure

Optional enrichment:

- Kaggle CVE Fix Pairs for security-oriented risk patterns

The graph fits because code review is relationship-heavy: PRs modify files, files belong to modules, modules depend on each other, reviewers comment on files, comments mention issue types, and generated changes can resemble known risk patterns.

## Free-Tier MVP Tool: Text2Cypher

For Aura Free, use Text2Cypher only. This satisfies the required tool category while keeping the setup simple.

Name:

```text
reviewgraph_text2cypher
```

Description:

```text
Answer questions about pull request risk, modified files, review comments, modules, dependency cycles, AI-assisted changes, and known risk patterns by generating Cypher over the ReviewGraph AI graph.
```

Recommended demo questions:

- Why is PR-184 risky?
- Which services are becoming tightly coupled?
- Which files attract the most review concern?
- What known risk patterns are linked to AI-assisted changes?

## Optional Upgrade: Cypher Template - explain_pr_risk

Description:

Explain why a pull request may be risky by combining modified files, affected modules, review concerns, dependency cycles, and similar known risk patterns.

Parameters:

- `prId`: Pull request id, for example `PR-184`

Cypher:

```cypher
MATCH (pr:PullRequest {id: $prId})-[:MODIFIES]->(file:File)-[:PART_OF]->(module:Module)
OPTIONAL MATCH (pr)-[:HAS_REVIEW_COMMENT]->(comment:ReviewComment)-[:MENTIONS]->(issue:IssueType)
OPTIONAL MATCH path=(module)-[:DEPENDS_ON*1..3]->(module)
OPTIONAL MATCH (change:AIChange)-[:INTRODUCED_BY]->(pr)
OPTIONAL MATCH (change)-[similar:SIMILAR_TO]->(pattern:RiskPattern)-[:CAUSES]->(patternIssue:IssueType)
RETURN pr.id AS pr,
       pr.title AS title,
       pr.riskScore AS riskScore,
       collect(DISTINCT file.path) AS modifiedFiles,
       collect(DISTINCT module.name) AS modules,
       collect(DISTINCT issue.name) AS reviewIssues,
       collect(DISTINCT pattern.name) AS similarRiskPatterns,
       collect(DISTINCT patternIssue.name) AS patternIssues,
       count(DISTINCT path) AS dependencyCycles
```

Example questions:

- Why is PR-184 risky?
- Explain the risk of this pull request.
- What should reviewers focus on before merge?

## Tool 2: Cypher Template - tightly_coupled_modules

Description:

Find modules involved in short dependency cycles or tight coupling.

Cypher:

```cypher
MATCH path=(module:Module)-[:DEPENDS_ON*1..3]->(module)
RETURN module.name AS cycleEntry,
       length(path) AS cycleLength,
       [node IN nodes(path) | node.name] AS cycle
ORDER BY cycleLength ASC
LIMIT 10
```

Example questions:

- Which services are becoming tightly coupled?
- Show dependency cycles.
- Which module relationships should architects review?

## Tool 3: Cypher Template - review_hotspots

Description:

Find files and modules receiving the most review concern.

Cypher:

```cypher
MATCH (file:File)<-[:ON_FILE]-(comment:ReviewComment)-[:MENTIONS]->(issue:IssueType)
OPTIONAL MATCH (file)-[:PART_OF]->(module:Module)
RETURN file.path AS file,
       module.name AS module,
       collect(DISTINCT issue.name) AS issues,
       count(comment) AS reviewConcernCount
ORDER BY reviewConcernCount DESC
LIMIT 10
```

Example questions:

- Which files attract the most review concern?
- Where do reviewers repeatedly flag maintainability?
- What code areas need ownership attention?

## Tool 4: Text2Cypher

Description:

Use Text2Cypher for open-ended graph questions that are not covered by templates.

Recommended scope:

- Pull request risk
- Review comments
- Files and modules
- Dependency paths
- Reviewer behavior
- AI changes and risk patterns

Schema summary:

```text
(:Repository)-[:HAS_PR]->(:PullRequest)
(:PullRequest)-[:MODIFIES]->(:File)
(:PullRequest)-[:HAS_REVIEW_COMMENT]->(:ReviewComment)
(:Reviewer)-[:WROTE]->(:ReviewComment)
(:ReviewComment)-[:ON_FILE]->(:File)
(:ReviewComment)-[:MENTIONS]->(:IssueType)
(:File)-[:PART_OF]->(:Module)
(:File)-[:IMPORTS]->(:File)
(:File)-[:DEFINES]->(:Function)
(:Module)-[:DEPENDS_ON]->(:Module)
(:AIChange)-[:INTRODUCED_BY]->(:PullRequest)
(:AIChange)-[:TOUCHES]->(:File)
(:AIChange)-[:SIMILAR_TO]->(:RiskPattern)
(:RiskPattern)-[:CAUSES]->(:IssueType)
```

## Tool 5: Similarity Search

Description:

Find review comments, AI changes, or known risk patterns semantically similar to the user's concern or code-change summary.

Recommended indexed text properties:

- `ReviewComment.embeddingText`
- `AIChange.embeddingText`
- `RiskPattern.embeddingText`

Vector indexes prepared by this repo:

- `review_comment_embedding` on `ReviewComment.embedding`
- `ai_change_embedding` on `AIChange.embedding`
- `risk_pattern_embedding` on `RiskPattern.embedding`

Best demo question:

> Find past review concerns similar to "generated token validation duplicates auth policy across services."

Expected agent behavior:

1. Use Similarity Search to find relevant comments or risk patterns.
2. Expand from those nodes to PRs, files, modules, and issue types.
3. Explain why the pattern matters.

## Screenshot Checklist

Capture these for submission:

- Aura database graph overview showing `PullRequest`, `File`, `Module`, `ReviewComment`, and `RiskPattern`.
- Aura Agent configuration showing ReviewGraph AI tools.
- Agent response to: `Why is PR-184 risky?`
- Agent response to: `Which services are becoming tightly coupled?`
- Optional short demo video showing the agent answer and graph path.
