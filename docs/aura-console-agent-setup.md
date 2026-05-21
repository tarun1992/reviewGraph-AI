# Aura Console Agent Setup Checklist

Use this Text2Cypher-only setup for the Aura Free MVP.

## 1. Organization Settings

In Aura Console:

1. Open Organization settings.
2. Enable GenAI assistance.
3. Open Security settings.
4. Enable tool authentication for the `Instance01` database.

Neo4j's Aura Agent guide says tool authentication is required so the agent can access the database.

## 2. Create Agent

Go to:

```text
Aura Console -> Data Services -> Agents -> Create with AI
```

Instance:

```text
Instance01
```

If Aura asks whether the instance contains vector embeddings:

```text
Leave it unchecked.
```

Agent creation prompt:

```text
Create an agent named ReviewGraph AI.

ReviewGraph AI is an AI code review intelligence agent for engineering teams. It explains pull request risk using graph evidence from repositories, pull requests, files, modules, review comments, dependency relationships, AI-assisted changes, and known risk patterns.

Use one Text2Cypher tool. The graph schema is:

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

Useful node properties:
- PullRequest: id, title, riskScore, isAiAssisted, author, state
- File: path, module, isSecuritySensitive
- Module: name, layer
- ReviewComment: body, sentiment, issueType
- IssueType: name, severity, description
- AIChange: summary
- RiskPattern: name, severity, description

The agent should help reviewers answer:
- Why is this PR risky?
- Which modules or services are tightly coupled?
- Which files attract the most review concern?
- What known risk pattern is an AI-assisted change similar to?
- What should reviewers focus on before merge?

Important behavior:
- Prefer graph paths and relationship evidence in the answer.
- For PR-specific questions, start from PullRequest.id. The main demo id is PR-184.
- For coupling questions, look for (:Module)-[:DEPENDS_ON*1..3]->(:Module) cycles.
- For risk-pattern questions, traverse AIChange -> SIMILAR_TO -> RiskPattern -> CAUSES -> IssueType.
- For review concern questions, traverse PullRequest -> HAS_REVIEW_COMMENT -> ReviewComment -> MENTIONS -> IssueType.

Always answer with:
1. A direct review insight.
2. The graph evidence that supports it.
3. The specific relationships or dependency paths that matter.
4. A practical recommendation before merge.

Do not claim code is bad only because it was AI-assisted. Treat AI assistance as a review signal, not a verdict.
```

## 3. Text2Cypher Tool

Name:

```text
reviewgraph_text2cypher
```

Description:

```text
Answer questions about pull request risk, modified files, review comments, modules, dependency cycles, AI-assisted changes, and known risk patterns by generating Cypher over the ReviewGraph AI graph.
```

## 4. Test Questions

Use these in the agent playground:

```text
Why is PR-184 risky?
```

```text
Which services are becoming tightly coupled?
```

```text
Which files attract the most review concern?
```

```text
What known risk patterns are linked to AI-assisted changes?
```

## 5. Query Hints

If Text2Cypher needs a nudge, test these manually in Aura Query.

Why PR-184 is risky:

```cypher
MATCH (pr:PullRequest {id: "PR-184"})-[:MODIFIES]->(file:File)-[:PART_OF]->(module:Module)
OPTIONAL MATCH (pr)-[:HAS_REVIEW_COMMENT]->(comment:ReviewComment)-[:MENTIONS]->(issue:IssueType)
OPTIONAL MATCH path=(module)-[:DEPENDS_ON*1..3]->(module)
OPTIONAL MATCH (change:AIChange)-[:INTRODUCED_BY]->(pr)
OPTIONAL MATCH (change)-[:SIMILAR_TO]->(pattern:RiskPattern)-[:CAUSES]->(patternIssue:IssueType)
RETURN pr.id AS pr,
       pr.title AS title,
       pr.riskScore AS riskScore,
       collect(DISTINCT file.path) AS files,
       collect(DISTINCT module.name) AS modules,
       collect(DISTINCT issue.name) AS reviewIssues,
       collect(DISTINCT pattern.name) AS similarPatterns,
       collect(DISTINCT patternIssue.name) AS patternIssues,
       count(DISTINCT path) AS dependencyCycles
```

Dependency cycles:

```cypher
MATCH path=(module:Module)-[:DEPENDS_ON*1..3]->(module)
RETURN module.name AS cycleEntry,
       length(path) AS cycleLength,
       [node IN nodes(path) | node.name] AS cycle
ORDER BY cycleLength ASC
LIMIT 10
```

## 6. Screenshots for Submission

Capture:

1. Aura graph view showing `PullRequest`, `File`, `Module`, `ReviewComment`, and `RiskPattern`.
2. Agent configuration showing `ReviewGraph AI`.
3. Tool list showing the Text2Cypher tool.
4. Agent answer to `Why is PR-184 risky?`.
5. Agent answer to `Which services are becoming tightly coupled?`.
