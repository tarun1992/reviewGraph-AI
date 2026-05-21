// Demo query 1: Why is this PR risky?
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
       count(DISTINCT path) AS dependencyCycles;

// Demo query 2: Which modules are tightly coupled?
MATCH path=(module:Module)-[:DEPENDS_ON*1..3]->(module)
RETURN module.name AS cycleEntry,
       length(path) AS cycleLength,
       [node IN nodes(path) | node.name] AS cycle
ORDER BY cycleLength ASC;

// Demo query 3: Which files attract the most review concern?
MATCH (file:File)<-[:ON_FILE]-(comment:ReviewComment)-[:MENTIONS]->(issue:IssueType)
RETURN file.path AS file,
       collect(DISTINCT issue.name) AS issues,
       count(comment) AS reviewConcernCount
ORDER BY reviewConcernCount DESC;

// Demo query 4: Which AI changes look like known risk patterns?
MATCH (change:AIChange)-[rel:SIMILAR_TO]->(pattern:RiskPattern)-[:CAUSES]->(issue:IssueType)
MATCH (change)-[:INTRODUCED_BY]->(pr:PullRequest)
RETURN pr.id AS pr,
       change.summary AS aiChange,
       pattern.name AS similarPattern,
       rel.score AS similarity,
       collect(issue.name) AS likelyIssues
ORDER BY similarity DESC;
