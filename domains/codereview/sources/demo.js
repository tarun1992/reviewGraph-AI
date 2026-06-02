// Built-in demo dataset (SOURCE=demo).
//
// A self-contained, synthetic engineering org used for the offline demo and
// tests. It exercises every ReviewGraph AI feature: security-sensitive files,
// AI-introduced risk patterns, a dependency cycle, a coupling regression that
// caused a past incident, governing ADRs/decisions, and lessons learned.
//
// To review a real repository instead, set GITHUB_REPO (see sources/github.js).

export const demoDataset = {
  flagshipEntityId: "PR-512",

  repositories: [
    {
      id: "repo_reviewgraph_demo",
      name: "reviewgraph-demo-services",
      url: "https://github.com/example/reviewgraph-demo-services",
      primaryLanguage: "TypeScript"
    }
  ],

  teams: [
    { id: "team_identity", name: "Identity Team", domain: "Authentication & Accounts" },
    { id: "team_payments", name: "Payments Team", domain: "Billing & Payments" },
    { id: "team_platform", name: "Platform Team", domain: "Shared Infrastructure" }
  ],

  developers: [
    { id: "dev_maya_chen", name: "Maya Chen", login: "maya-chen", teamId: "team_identity" },
    { id: "dev_noah_patel", name: "Noah Patel", login: "noah-patel", teamId: "team_payments" },
    { id: "dev_elena_ruiz", name: "Elena Ruiz", login: "elena-ruiz", teamId: "team_identity" },
    { id: "dev_liam_osei", name: "Liam Osei", login: "liam-osei", teamId: "team_payments" },
    { id: "dev_security_reviewer", name: "Priya Nair", login: "security-reviewer", teamId: "team_platform" },
    { id: "dev_platform_reviewer", name: "Sam Okafor", login: "platform-reviewer", teamId: "team_platform" }
  ],

  services: [
    { id: "svc_auth", name: "AuthService", criticality: "high", teamId: "team_identity" },
    { id: "svc_tokens", name: "TokenService", criticality: "high", teamId: "team_identity" },
    { id: "svc_users", name: "UserService", criticality: "high", teamId: "team_identity" },
    { id: "svc_billing", name: "BillingService", criticality: "high", teamId: "team_payments" },
    { id: "svc_notifications", name: "NotificationService", criticality: "medium", teamId: "team_platform" }
  ],

  modules: [
    { id: "mod_auth", name: "AuthModule", layer: "domain", serviceId: "svc_auth" },
    { id: "mod_tokens", name: "TokensModule", layer: "domain", serviceId: "svc_tokens" },
    { id: "mod_users", name: "UsersModule", layer: "domain", serviceId: "svc_users" },
    { id: "mod_billing", name: "BillingModule", layer: "domain", serviceId: "svc_billing" },
    { id: "mod_notifications", name: "NotificationsModule", layer: "domain", serviceId: "svc_notifications" },
    { id: "mod_shared", name: "SharedModule", layer: "shared", serviceId: "svc_notifications" }
  ],

  moduleDeps: [
    { source: "mod_auth", target: "mod_tokens", reason: "AuthService validates TokenService output" },
    { source: "mod_tokens", target: "mod_users", reason: "TokenService resolves user state" },
    { source: "mod_users", target: "mod_auth", reason: "UserService checks auth policy" },
    { source: "mod_billing", target: "mod_notifications", reason: "Invoice retry sends email notification" },
    { source: "mod_billing", target: "mod_auth", reason: "Billing retry calls auth validation inline", regression: true }
  ],

  files: [
    { id: "file_token_policy", path: "src/services/auth/tokenPolicy.ts", moduleId: "mod_auth", securitySensitive: true },
    { id: "file_session_guard", path: "src/utils/sessionGuard.ts", moduleId: "mod_auth", securitySensitive: true },
    { id: "file_token_service", path: "src/services/tokens/tokenService.ts", moduleId: "mod_tokens", securitySensitive: true },
    { id: "file_user_service", path: "src/services/users/userService.ts", moduleId: "mod_users", securitySensitive: true },
    { id: "file_retry_invoice", path: "src/services/billing/retryInvoice.ts", moduleId: "mod_billing", securitySensitive: false },
    { id: "file_billing_auth", path: "src/services/billing/authCheck.ts", moduleId: "mod_billing", securitySensitive: true, introducesDependency: { fromServiceId: "svc_billing", toServiceId: "svc_auth" } },
    { id: "file_email_queue", path: "src/services/notifications/emailQueue.ts", moduleId: "mod_notifications", securitySensitive: false },
    { id: "file_retry", path: "src/shared/retry.ts", moduleId: "mod_shared", securitySensitive: false },
    { id: "file_profile_form", path: "src/features/profile/settingsForm.tsx", moduleId: "mod_users", securitySensitive: false }
  ],

  issueTypes: [
    { id: "issue_security", name: "Security Sensitive Change", severity: "high", description: "Touches authentication, tokens, permissions, or secrets." },
    { id: "issue_duplicate", name: "Duplicate Logic", severity: "medium", description: "Logic repeats existing behavior and may diverge." },
    { id: "issue_coupling", name: "Architecture Coupling", severity: "high", description: "Creates tight dependencies, cycles, or cross-layer leakage." },
    { id: "issue_maintainability", name: "Maintainability", severity: "medium", description: "Harder to review, test, or safely evolve." },
    { id: "issue_concern", name: "Review Concern", severity: "low", description: "General review concern needing investigation." }
  ],

  riskPatterns: [
    { id: "pattern_scattered_auth", name: "ScatteredAuthPolicy", severity: "high", description: "Authorization or token validation policy is split across multiple modules.", embeddingText: "auth token validation duplicated scattered policy permission risk", causes: ["issue_security", "issue_duplicate"] },
    { id: "pattern_hidden_retry", name: "HiddenSideEffectRetry", severity: "medium", description: "Retry helper hides side effects and can duplicate writes or notifications.", embeddingText: "retry side effect duplicate notification billing", causes: ["issue_duplicate"] },
    { id: "pattern_cross_layer", name: "CrossLayerShortcut", severity: "medium", description: "Feature code bypasses service boundaries and imports infrastructure directly.", embeddingText: "cross layer import service boundary architecture coupling", causes: ["issue_coupling"] },
    { id: "pattern_circular", name: "CircularDependency", severity: "high", description: "Modules form a dependency cycle, making changes ripple unpredictably.", embeddingText: "circular dependency cycle identity auth ripple deadlock", causes: ["issue_coupling"] },
    { id: "pattern_coupling_regression", name: "ServiceCouplingRegression", severity: "high", description: "A service reintroduces a direct dependency that previously caused an incident.", embeddingText: "billing depends on auth direct coupling regression reverted incident", causes: ["issue_coupling"] }
  ],

  pullRequests: [
    { id: "PR-184", number: 184, title: "AI-assisted auth token refactor", authorId: "dev_maya_chen", state: "open", isAiAssisted: true, baseRiskScore: 78, summary: "Introduces duplicated token validation, touches security-sensitive auth code, and sits on a dependency cycle across identity services.", files: ["file_token_policy", "file_user_service", "file_token_service", "file_session_guard"] },
    { id: "PR-207", number: 207, title: "Generated billing retry helper", authorId: "dev_noah_patel", state: "open", isAiAssisted: true, baseRiskScore: 58, summary: "Adds retry logic similar to a rejected helper and increases coupling between billing and notification services.", files: ["file_retry_invoice", "file_email_queue", "file_retry"] },
    { id: "PR-219", number: 219, title: "Manual profile settings cleanup", authorId: "dev_elena_ruiz", state: "open", isAiAssisted: false, baseRiskScore: 22, summary: "Low-risk cleanup isolated to profile settings with no new service dependencies.", files: ["file_profile_form"] },
    { id: "PR-312", number: 312, title: "Inline auth check inside billing retry", authorId: "dev_liam_osei", state: "reverted", isAiAssisted: false, baseRiskScore: 81, summary: "Historical change that made BillingService depend directly on AuthService. Contributed to Incident-47 and was later reverted.", files: ["file_retry_invoice", "file_billing_auth"] },
    { id: "PR-512", number: 512, title: "Add inline auth validation to billing retry", authorId: "dev_noah_patel", state: "open", isAiAssisted: true, baseRiskScore: 62, summary: "Reintroduces a direct BillingService -> AuthService dependency to validate tokens during invoice retries.", files: ["file_retry_invoice", "file_billing_auth"] }
  ],

  reviewComments: [
    { id: "comment_184_1", prId: "PR-184", reviewerId: "dev_security_reviewer", fileId: "file_token_policy", issueTypeId: "issue_duplicate", sentiment: "negative", body: "This duplicates token validation already in sessionGuard and makes the auth policy harder to maintain.", embeddingText: "duplicate token validation session guard auth policy maintain" },
    { id: "comment_184_2", prId: "PR-184", reviewerId: "dev_security_reviewer", fileId: "file_token_service", issueTypeId: "issue_security", sentiment: "negative", body: "Security concern: token refresh now depends on user service, creating a circular auth dependency.", embeddingText: "security token refresh user service circular auth dependency" },
    { id: "comment_207_1", prId: "PR-207", reviewerId: "dev_platform_reviewer", fileId: "file_retry_invoice", issueTypeId: "issue_duplicate", sentiment: "negative", body: "Retry logic hides notification side effects and could send duplicate billing emails.", embeddingText: "retry hides notification side effects duplicate billing emails" },
    { id: "comment_512_1", prId: "PR-512", reviewerId: "dev_platform_reviewer", fileId: "file_billing_auth", issueTypeId: "issue_coupling", sentiment: "negative", body: "Billing should not call auth directly. This is the same coupling we reverted in PR-312.", embeddingText: "billing should not call auth directly coupling reverted pr-312" }
  ],

  aiChanges: [
    { id: "ai_184_auth", prId: "PR-184", fileId: "file_token_policy", summary: "Generated auth token branch duplicates session guard validation and scatters policy.", embeddingText: "generated auth token branch duplicate session guard validation scatter policy", patterns: [{ patternId: "pattern_scattered_auth", score: 0.91 }] },
    { id: "ai_207_retry", prId: "PR-207", fileId: "file_retry_invoice", summary: "Generated retry helper wraps billing side effects and notification sends.", embeddingText: "generated retry helper billing side effects notification sends duplicate", patterns: [{ patternId: "pattern_hidden_retry", score: 0.86 }] },
    { id: "ai_512_coupling", prId: "PR-512", fileId: "file_billing_auth", summary: "Generated inline auth validation makes billing depend directly on auth, mirroring a reverted change.", embeddingText: "generated inline auth validation billing depend auth reverted coupling regression", patterns: [{ patternId: "pattern_coupling_regression", score: 0.88 }, { patternId: "pattern_cross_layer", score: 0.72 }] }
  ],

  securityFindings: [
    { id: "finding_token_bypass", prId: "PR-184", fileId: "file_token_policy", severity: "high", title: "Possible token validation bypass", description: "Duplicated validation path may skip the central policy check." }
  ],

  releases: [
    { id: "rel_2024_11", name: "2024.11", shippedPrs: ["PR-312"] }
  ],

  deployments: [
    { id: "deploy_2024_11_billing", releaseId: "rel_2024_11", serviceId: "svc_billing", environment: "production", outcome: "incident" }
  ],

  incidents: [
    { id: "Incident-47", title: "Billing outage from auth coupling", severity: "SEV1", impactedServices: ["svc_billing", "svc_auth"], tracedToPr: "PR-312", rootCause: "Service coupling regression", summary: "A direct BillingService -> AuthService call introduced in PR-312 caused cascading billing failures during an auth deploy." },
    { id: "Incident-108", title: "Identity auth request deadlock", severity: "SEV2", impactedServices: ["svc_auth", "svc_tokens", "svc_users"], tracedToPr: "PR-184", rootCause: "Circular dependency", summary: "A circular dependency across identity services produced request deadlocks under load." }
  ],

  adrs: [
    { id: "ADR-7", title: "Services communicate via events, not direct calls", governsServiceId: "svc_billing", status: "accepted" },
    { id: "ADR-12", title: "JWT-only token validation policy", governsServiceId: "svc_auth", status: "accepted" }
  ],

  decisions: [
    { id: "decision_no_billing_auth", summary: "BillingService must not depend on AuthService directly", policy: "Use the events bus for cross-domain validation.", status: "active", aboutServiceId: "svc_billing", adrId: "ADR-7", forbids: { fromServiceId: "svc_billing", toServiceId: "svc_auth" } },
    { id: "decision_jwt_only", summary: "Token validation uses a single JWT policy", policy: "All token validation must route through the central AuthModule policy.", status: "active", aboutServiceId: "svc_auth", adrId: "ADR-12" }
  ],

  lessons: [
    { id: "lesson_billing_auth", statement: "BillingService must not depend on AuthService directly; validate via events instead.", fromIncident: "Incident-47", recommends: "Add a 'no cross-domain sync dependency' check to the review checklist.", appliesToModuleIds: ["mod_billing"], appliesToPatternIds: ["pattern_coupling_regression", "pattern_cross_layer"] },
    { id: "lesson_circular", statement: "Avoid circular dependencies across identity services; they cause deadlocks under load.", fromIncident: "Incident-108", recommends: "Run dependency-cycle review before merging identity changes.", appliesToModuleIds: ["mod_auth", "mod_tokens", "mod_users"], appliesToPatternIds: ["pattern_circular"] }
  ]
};
