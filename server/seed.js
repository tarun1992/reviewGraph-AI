import { closeDriver, runCypher } from "./neo4j.js";

const statements = [
  `MATCH (n)
WHERE any(label IN labels(n) WHERE label IN [
  "Developer",
  "PR",
  "Service",
  "File",
  "AI_Code",
  "CodeSmell",
  "AntiPattern"
])
DETACH DELETE n`,
  `CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (pr:PR) REQUIRE pr.id IS UNIQUE`,
  `CREATE CONSTRAINT service_name IF NOT EXISTS FOR (service:Service) REQUIRE service.name IS UNIQUE`,
  `CREATE CONSTRAINT file_path IF NOT EXISTS FOR (file:File) REQUIRE file.path IS UNIQUE`,
  `CREATE CONSTRAINT smell_name IF NOT EXISTS FOR (smell:CodeSmell) REQUIRE smell.name IS UNIQUE`,
  `CREATE CONSTRAINT pattern_name IF NOT EXISTS FOR (pattern:AntiPattern) REQUIRE pattern.name IS UNIQUE`,
  `CREATE
    (maya:Developer {name: "Maya Chen"}),
    (noah:Developer {name: "Noah Patel"}),
    (pr184:PR {id: "PR-184", title: "AI-assisted auth token refactor", risk: 88, aiGenerated: true}),
    (pr207:PR {id: "PR-207", title: "Generated billing retry helper", risk: 67, aiGenerated: true}),
    (auth:Service {name: "AuthService", criticality: "high"}),
    (users:Service {name: "UserService", criticality: "high"}),
    (tokens:Service {name: "TokenService", criticality: "high"}),
    (billing:Service {name: "BillingService", criticality: "medium"}),
    (notify:Service {name: "NotificationService", criticality: "medium"}),
    (tokenFile:File {path: "src/services/auth/tokenPolicy.ts", sensitive: true}),
    (userFile:File {path: "src/services/users/userService.ts", sensitive: true}),
    (tokenServiceFile:File {path: "src/services/tokens/tokenService.ts", sensitive: true}),
    (sessionFile:File {path: "src/utils/sessionGuard.ts", sensitive: true}),
    (billingFile:File {path: "src/services/billing/retryInvoice.ts", sensitive: false}),
    (emailFile:File {path: "src/services/notifications/emailQueue.ts", sensitive: false}),
    (retryFile:File {path: "src/shared/retry.ts", sensitive: false}),
    (aiAuth:AI_Code {id: "AI-Auth-Block", snippet: "Generated token validation and policy branching"}),
    (aiRetry:AI_Code {id: "AI-Retry-Helper", snippet: "Generated retry wrapper with side effect"}),
    (dup:CodeSmell {name: "DuplicateValidationLogic", severity: "high"}),
    (cycle:CodeSmell {name: "DependencyCycle", severity: "critical"}),
    (security:CodeSmell {name: "SecuritySensitiveChange", severity: "high"}),
    (coupling:CodeSmell {name: "CrossServiceCoupling", severity: "medium"}),
    (scattered:AntiPattern {name: "ScatteredAuthPolicy"}),
    (hiddenRetry:AntiPattern {name: "HiddenSideEffectRetry"}),
    (maya)-[:CREATED]->(pr184),
    (noah)-[:CREATED]->(pr207),
    (pr184)-[:MODIFIES]->(tokenFile),
    (pr184)-[:MODIFIES]->(userFile),
    (pr184)-[:MODIFIES]->(tokenServiceFile),
    (pr184)-[:MODIFIES]->(sessionFile),
    (pr207)-[:MODIFIES]->(billingFile),
    (pr207)-[:MODIFIES]->(emailFile),
    (pr207)-[:MODIFIES]->(retryFile),
    (tokenFile)-[:PART_OF]->(auth),
    (sessionFile)-[:PART_OF]->(auth),
    (userFile)-[:PART_OF]->(users),
    (tokenServiceFile)-[:PART_OF]->(tokens),
    (billingFile)-[:PART_OF]->(billing),
    (emailFile)-[:PART_OF]->(notify),
    (retryFile)-[:PART_OF]->(billing),
    (auth)-[:DEPENDS_ON]->(tokens),
    (tokens)-[:DEPENDS_ON]->(users),
    (users)-[:DEPENDS_ON]->(auth),
    (billing)-[:DEPENDS_ON]->(notify),
    (tokenFile)<-[:FOUND_IN]-(dup),
    (tokenFile)<-[:FOUND_IN]-(cycle),
    (tokenFile)<-[:FOUND_IN]-(security),
    (billingFile)<-[:FOUND_IN]-(coupling),
    (aiAuth)-[:INTRODUCED_BY]->(pr184),
    (aiRetry)-[:INTRODUCED_BY]->(pr207),
    (aiAuth)-[:SIMILAR_TO]->(scattered),
    (aiRetry)-[:SIMILAR_TO]->(hiddenRetry),
    (scattered)-[:CAUSES]->(dup),
    (hiddenRetry)-[:CAUSES]->(coupling)`
];

try {
  for (const statement of statements) {
    await runCypher(statement);
  }

  console.log("Seeded ReviewGraph AI demo data.");
} finally {
  await closeDriver();
}
