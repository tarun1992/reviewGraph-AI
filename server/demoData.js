export const demoData = {
  prs: [
    {
      id: "PR-184",
      title: "AI-assisted auth token refactor",
      author: "Maya Chen",
      aiGenerated: true,
      risk: 88,
      summary:
        "Introduces duplicated token validation, touches security-sensitive auth code, and creates a dependency cycle across identity services.",
      files: [
        "src/services/auth/tokenPolicy.ts",
        "src/services/users/userService.ts",
        "src/services/tokens/tokenService.ts",
        "src/utils/sessionGuard.ts"
      ],
      smells: ["DuplicateValidationLogic", "DependencyCycle", "SecuritySensitiveChange"],
      antiPatterns: ["ScatteredAuthPolicy"]
    },
    {
      id: "PR-207",
      title: "Generated billing retry helper",
      author: "Noah Patel",
      aiGenerated: true,
      risk: 67,
      summary:
        "Adds retry logic similar to a rejected helper and increases coupling between billing and notification services.",
      files: [
        "src/services/billing/retryInvoice.ts",
        "src/services/notifications/emailQueue.ts",
        "src/shared/retry.ts"
      ],
      smells: ["RepeatedRetryLogic", "CrossServiceCoupling"],
      antiPatterns: ["HiddenSideEffectRetry"]
    },
    {
      id: "PR-219",
      title: "Manual profile settings cleanup",
      author: "Elena Ruiz",
      aiGenerated: false,
      risk: 29,
      summary:
        "Low-risk cleanup isolated to profile settings with no new service dependencies.",
      files: ["src/features/profile/settingsForm.tsx", "src/features/profile/schema.ts"],
      smells: ["MinorComplexity"],
      antiPatterns: []
    }
  ],
  graph: {
    nodes: [
      { id: "PR-184", label: "PR", group: "pr", risk: 88 },
      { id: "AuthService", label: "AuthService", group: "service" },
      { id: "UserService", label: "UserService", group: "service" },
      { id: "TokenService", label: "TokenService", group: "service" },
      { id: "SessionGuard", label: "SessionGuard", group: "module" },
      { id: "DuplicateValidationLogic", label: "Duplicate validation", group: "smell" },
      { id: "ScatteredAuthPolicy", label: "Scattered auth policy", group: "antipattern" },
      { id: "DependencyCycle", label: "Dependency cycle", group: "smell" },
      { id: "AI-Auth-Block", label: "AI generated auth block", group: "ai" },
      { id: "PR-207", label: "PR", group: "pr", risk: 67 },
      { id: "BillingService", label: "BillingService", group: "service" },
      { id: "NotificationService", label: "NotificationService", group: "service" },
      { id: "RetryUtility", label: "RetryUtility", group: "module" },
      { id: "HiddenSideEffectRetry", label: "Hidden side-effect retry", group: "antipattern" }
    ],
    links: [
      { source: "PR-184", target: "AuthService", type: "MODIFIES" },
      { source: "PR-184", target: "UserService", type: "MODIFIES" },
      { source: "PR-184", target: "TokenService", type: "MODIFIES" },
      { source: "AuthService", target: "TokenService", type: "DEPENDS_ON" },
      { source: "TokenService", target: "UserService", type: "DEPENDS_ON" },
      { source: "UserService", target: "AuthService", type: "DEPENDS_ON" },
      { source: "SessionGuard", target: "AuthService", type: "CALLS" },
      { source: "DuplicateValidationLogic", target: "AuthService", type: "FOUND_IN" },
      { source: "DependencyCycle", target: "AuthService", type: "FOUND_IN" },
      { source: "AI-Auth-Block", target: "ScatteredAuthPolicy", type: "SIMILAR_TO" },
      { source: "ScatteredAuthPolicy", target: "DuplicateValidationLogic", type: "CAUSES" },
      { source: "PR-207", target: "BillingService", type: "MODIFIES" },
      { source: "PR-207", target: "NotificationService", type: "MODIFIES" },
      { source: "BillingService", target: "NotificationService", type: "DEPENDS_ON" },
      { source: "BillingService", target: "RetryUtility", type: "CALLS" },
      { source: "RetryUtility", target: "HiddenSideEffectRetry", type: "SIMILAR_TO" }
    ]
  },
  answers: {
    risk: {
      cypher: `MATCH (pr:PR {id: $prId})-[:MODIFIES]->(f:File)
OPTIONAL MATCH (f)<-[:FOUND_IN]-(smell:CodeSmell)
OPTIONAL MATCH path=(f)-[:DEPENDS_ON|CALLS*1..3]->(other)
RETURN pr, collect(DISTINCT f) AS files, collect(DISTINCT smell) AS smells, collect(DISTINCT path) AS evidence`,
      title: "Why this PR is risky",
      answer:
        "PR-184 is high risk because it touches authentication code, duplicates token validation already present in SessionGuard, and introduces a cycle: AuthService -> TokenService -> UserService -> AuthService.",
      evidence: [
        "Security-sensitive files modified: tokenPolicy.ts, userService.ts, tokenService.ts",
        "Cycle detected across AuthService, TokenService, and UserService",
        "AI-generated block is similar to the ScatteredAuthPolicy anti-pattern",
        "Duplicate validation logic appears in 3 auth-adjacent modules"
      ]
    },
    aiImpact: {
      cypher: `MATCH (ai:AI_Code)-[:INTRODUCED_BY]->(pr:PR)-[:MODIFIES]->(file:File)-[:PART_OF]->(service:Service)
RETURN service.name AS service, count(DISTINCT file) AS changedFiles
ORDER BY changedFiles DESC`,
      title: "Modules most affected by AI-generated changes",
      answer:
        "AuthService is the most affected service, followed by TokenService and BillingService. The auth changes carry the highest blast radius because they sit on a dependency cycle.",
      evidence: [
        "AuthService has 3 AI-touched files in the demo graph",
        "TokenService is both modified by the PR and part of the dependency cycle",
        "BillingService has generated retry logic similar to a known rejected pattern"
      ]
    },
    coupling: {
      cypher: `MATCH path=(a:Service)-[:DEPENDS_ON|CALLS*1..2]->(b:Service)
WITH a, b, count(path) AS couplingPaths
WHERE couplingPaths > 1
RETURN a.name AS source, b.name AS target, couplingPaths
ORDER BY couplingPaths DESC`,
      title: "Services becoming tightly coupled",
      answer:
        "AuthService, UserService, and TokenService are becoming tightly coupled. Each service now has a short dependency path back to another service in the same review area.",
      evidence: [
        "AuthService depends on TokenService",
        "TokenService depends on UserService",
        "UserService depends on AuthService",
        "The shortest cycle length is 3, which is severe for core identity modules"
      ]
    },
    similarity: {
      cypher: `MATCH (ai:AI_Code)-[:SIMILAR_TO]->(pattern:AntiPattern)
OPTIONAL MATCH (pattern)-[:CAUSES]->(issue:CodeSmell)
RETURN ai.id AS generatedCode, pattern.name AS similarPattern, collect(issue.name) AS likelyIssues`,
      title: "Similarity to known anti-patterns",
      answer:
        "The generated auth block is similar to ScatteredAuthPolicy, a pattern linked to duplicated validation and inconsistent authorization decisions.",
      evidence: [
        "AI-Auth-Block SIMILAR_TO ScatteredAuthPolicy",
        "ScatteredAuthPolicy CAUSES DuplicateValidationLogic",
        "The same policy decision is now split across SessionGuard and AuthService"
      ]
    }
  }
};
