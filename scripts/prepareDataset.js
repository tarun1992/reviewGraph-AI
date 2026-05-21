import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processedDir = path.join(rootDir, "data", "processed");
const rawDir = path.join(rootDir, "data", "raw");

const args = process.argv.slice(2);
const mode = args.includes("--repo")
  ? "repo"
  : args.includes("--kaggle")
    ? "kaggle"
    : "sample";

const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const csvHeaders = {
  repositories: ["id", "name", "url", "primaryLanguage"],
  pull_requests: ["id", "repoId", "number", "title", "author", "state", "isAiAssisted", "riskScore", "url"],
  files: ["id", "repoId", "path", "module", "extension", "isSecuritySensitive"],
  modules: ["id", "repoId", "name", "layer"],
  functions: ["id", "fileId", "name", "kind"],
  reviewers: ["id", "login"],
  review_comments: ["id", "prId", "reviewerId", "fileId", "body", "issueType", "sentiment", "embeddingText"],
  issue_types: ["id", "name", "description", "severity"],
  risk_patterns: ["id", "name", "description", "severity", "embeddingText"],
  ai_changes: ["id", "prId", "fileId", "summary", "embeddingText"],
  rel_repo_prs: ["repoId", "prId"],
  rel_pr_files: ["prId", "fileId"],
  rel_pr_comments: ["prId", "commentId"],
  rel_reviewer_comments: ["reviewerId", "commentId"],
  rel_comment_files: ["commentId", "fileId"],
  rel_file_modules: ["fileId", "moduleId"],
  rel_module_deps: ["sourceModuleId", "targetModuleId", "reason"],
  rel_file_imports: ["sourceFileId", "targetFileId", "importName"],
  rel_file_functions: ["fileId", "functionId"],
  rel_comment_issues: ["commentId", "issueTypeId"],
  rel_pattern_issues: ["patternId", "issueTypeId"],
  rel_ai_patterns: ["aiChangeId", "patternId", "score"]
};

const tables = Object.fromEntries(
  Object.keys(csvHeaders).map((key) => [key, []])
);

function add(table, row) {
  tables[table].push(row);
  return row;
}

function slug(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function moduleNameForFile(filePath) {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  const boundaryIndex = parts.findIndex((part) => ["services", "features", "packages"].includes(part));

  if (boundaryIndex >= 0 && parts[boundaryIndex + 1]) {
    return toTitle(parts[boundaryIndex + 1]).replace(/\s/g, "") + "Module";
  }

  const srcIndex = parts.findIndex((part) => part === "src");
  if (srcIndex >= 0 && parts[srcIndex + 1]) {
    return toTitle(parts[srcIndex + 1]).replace(/\s/g, "") + "Module";
  }

  return parts.length > 1 ? toTitle(parts[parts.length - 2]).replace(/\s/g, "") + "Module" : "RootModule";
}

function toTitle(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isSecuritySensitive(filePath, text = "") {
  return /auth|token|password|secret|session|jwt|crypto|permission|login|security/i.test(
    `${filePath} ${text}`
  );
}

function detectIssueType(text) {
  const value = String(text || "").toLowerCase();

  if (/security|auth|token|permission|password|secret/.test(value)) return "security_sensitive_change";
  if (/duplicate|repeated|copy|same logic/.test(value)) return "duplicate_logic";
  if (/coupl|depend|cycle|circular|architecture/.test(value)) return "architecture_coupling";
  if (/complex|hard to read|maintain/.test(value)) return "maintainability";

  return "review_concern";
}

function sentimentForComment(text) {
  const value = String(text || "").toLowerCase();
  if (/great|nice|good|clean|thanks/.test(value)) return "positive";
  if (/risk|bug|issue|problem|wrong|unsafe|concern|avoid/.test(value)) return "negative";
  return "neutral";
}

function ensureCoreTaxonomy() {
  const issues = [
    ["security_sensitive_change", "Security Sensitive Change", "Changes authentication, tokens, permissions, secrets, or other high-risk code.", "high"],
    ["duplicate_logic", "Duplicate Logic", "Logic repeats existing behavior and may diverge across modules.", "medium"],
    ["architecture_coupling", "Architecture Coupling", "A change creates tight dependencies, cycles, or cross-layer leakage.", "high"],
    ["maintainability", "Maintainability", "Code is harder to review, test, or safely evolve.", "medium"],
    ["review_concern", "Review Concern", "General human review concern that needs investigation.", "low"]
  ];

  const patterns = [
    ["scattered_auth_policy", "Scattered Auth Policy", "Authorization or token validation policy is split across multiple modules.", "high", "auth token validation duplicated scattered policy permission risk"],
    ["hidden_side_effect_retry", "Hidden Side Effect Retry", "Retry helper hides side effects and can duplicate writes or notifications.", "medium", "retry side effect duplicate notification billing"],
    ["cross_layer_shortcut", "Cross Layer Shortcut", "Feature code bypasses service boundaries and imports infrastructure directly.", "medium", "cross layer import service boundary architecture coupling"]
  ];

  for (const [id, name, description, severity] of issues) {
    add("issue_types", { id, name, description, severity });
  }

  for (const [id, name, description, severity, embeddingText] of patterns) {
    add("risk_patterns", { id, name, description, severity, embeddingText });
  }

  add("rel_pattern_issues", { patternId: "scattered_auth_policy", issueTypeId: "security_sensitive_change" });
  add("rel_pattern_issues", { patternId: "scattered_auth_policy", issueTypeId: "duplicate_logic" });
  add("rel_pattern_issues", { patternId: "hidden_side_effect_retry", issueTypeId: "duplicate_logic" });
  add("rel_pattern_issues", { patternId: "cross_layer_shortcut", issueTypeId: "architecture_coupling" });
}

function addRepository({ id, name, url = "", primaryLanguage = "TypeScript" }) {
  add("repositories", { id, name, url, primaryLanguage });
}

function ensureModule(repoId, name, layer = "application") {
  const id = `${repoId}_${slug(name)}`;
  if (!tables.modules.some((module) => module.id === id)) {
    add("modules", { id, repoId, name, layer });
  }
  return id;
}

function ensureFile(repoId, filePath, content = "") {
  const id = `${repoId}_${slug(filePath)}`;
  const module = moduleNameForFile(filePath);
  const moduleId = ensureModule(repoId, module, layerForFile(filePath));

  if (!tables.files.some((file) => file.id === id)) {
    add("files", {
      id,
      repoId,
      path: filePath,
      module,
      extension: path.extname(filePath).replace(".", ""),
      isSecuritySensitive: String(isSecuritySensitive(filePath, content))
    });
    add("rel_file_modules", { fileId: id, moduleId });
  }

  return id;
}

function layerForFile(filePath) {
  if (/controller|route|page|view|component/i.test(filePath)) return "interface";
  if (/repo|dao|db|database|model/i.test(filePath)) return "data";
  if (/service|domain|core/i.test(filePath)) return "domain";
  if (/util|shared|lib/i.test(filePath)) return "shared";
  return "application";
}

function addPr({ repoId, id, number, title, author, state = "merged", isAiAssisted = false, riskScore = 50, url = "" }) {
  add("pull_requests", {
    id,
    repoId,
    number,
    title,
    author,
    state,
    isAiAssisted: String(isAiAssisted),
    riskScore,
    url
  });
  add("rel_repo_prs", { repoId, prId: id });
}

function addReview({ id, prId, reviewer, fileId, body }) {
  const reviewerId = `reviewer_${slug(reviewer)}`;
  const issueTypeId = detectIssueType(body);

  if (!tables.reviewers.some((row) => row.id === reviewerId)) {
    add("reviewers", { id: reviewerId, login: reviewer });
  }

  add("review_comments", {
    id,
    prId,
    reviewerId,
    fileId,
    body,
    issueType: issueTypeId,
    sentiment: sentimentForComment(body),
    embeddingText: body
  });
  add("rel_pr_comments", { prId, commentId: id });
  add("rel_reviewer_comments", { reviewerId, commentId: id });
  add("rel_comment_files", { commentId: id, fileId });
  add("rel_comment_issues", { commentId: id, issueTypeId });
}

function addAiChange({ id, prId, fileId, summary, patternId, score }) {
  add("ai_changes", {
    id,
    prId,
    fileId,
    summary,
    embeddingText: summary
  });
  add("rel_ai_patterns", { aiChangeId: id, patternId, score });
}

async function buildSampleDataset() {
  ensureCoreTaxonomy();
  const repoId = "repo_reviewgraph_demo";
  addRepository({
    id: repoId,
    name: "reviewgraph-demo-services",
    url: "https://github.com/example/reviewgraph-demo-services"
  });

  const authFile = ensureFile(repoId, "src/services/auth/tokenPolicy.ts", "validate token permission auth");
  const userFile = ensureFile(repoId, "src/services/users/userService.ts", "user permission session auth");
  const tokenFile = ensureFile(repoId, "src/services/tokens/tokenService.ts", "token issue refresh jwt");
  const sessionFile = ensureFile(repoId, "src/utils/sessionGuard.ts", "session guard token validation");
  const billingFile = ensureFile(repoId, "src/services/billing/retryInvoice.ts", "billing retry invoice");
  const notifyFile = ensureFile(repoId, "src/services/notifications/emailQueue.ts", "email queue notification");

  addPr({
    repoId,
    id: "PR-184",
    number: 184,
    title: "AI-assisted auth token refactor",
    author: "maya-chen",
    isAiAssisted: true,
    riskScore: 88,
    url: "https://github.com/example/reviewgraph-demo-services/pull/184"
  });
  addPr({
    repoId,
    id: "PR-207",
    number: 207,
    title: "Generated billing retry helper",
    author: "noah-patel",
    isAiAssisted: true,
    riskScore: 67,
    url: "https://github.com/example/reviewgraph-demo-services/pull/207"
  });

  for (const fileId of [authFile, userFile, tokenFile, sessionFile]) {
    add("rel_pr_files", { prId: "PR-184", fileId });
  }
  for (const fileId of [billingFile, notifyFile]) {
    add("rel_pr_files", { prId: "PR-207", fileId });
  }

  add("rel_module_deps", {
    sourceModuleId: ensureModule(repoId, "AuthModule", "domain"),
    targetModuleId: ensureModule(repoId, "TokensModule", "domain"),
    reason: "AuthService validates TokenService output"
  });
  add("rel_module_deps", {
    sourceModuleId: ensureModule(repoId, "TokensModule", "domain"),
    targetModuleId: ensureModule(repoId, "UsersModule", "domain"),
    reason: "TokenService resolves user state"
  });
  add("rel_module_deps", {
    sourceModuleId: ensureModule(repoId, "UsersModule", "domain"),
    targetModuleId: ensureModule(repoId, "AuthModule", "domain"),
    reason: "UserService checks auth policy"
  });
  add("rel_module_deps", {
    sourceModuleId: ensureModule(repoId, "BillingModule", "domain"),
    targetModuleId: ensureModule(repoId, "NotificationsModule", "domain"),
    reason: "Invoice retry sends email notification"
  });

  addReview({
    id: "comment_184_1",
    prId: "PR-184",
    reviewer: "senior-reviewer",
    fileId: authFile,
    body: "This duplicates token validation already in sessionGuard and makes the auth policy harder to maintain."
  });
  addReview({
    id: "comment_184_2",
    prId: "PR-184",
    reviewer: "security-reviewer",
    fileId: tokenFile,
    body: "Security concern: token refresh now depends on user service, creating a circular auth dependency."
  });
  addReview({
    id: "comment_207_1",
    prId: "PR-207",
    reviewer: "platform-reviewer",
    fileId: billingFile,
    body: "Retry logic hides notification side effects and could send duplicate billing emails."
  });

  addAiChange({
    id: "ai_change_184_auth",
    prId: "PR-184",
    fileId: authFile,
    summary: "Generated auth token branch duplicates session guard validation and scatters policy.",
    patternId: "scattered_auth_policy",
    score: 0.91
  });
  addAiChange({
    id: "ai_change_207_retry",
    prId: "PR-207",
    fileId: billingFile,
    summary: "Generated retry helper wraps billing side effects and notification sends.",
    patternId: "hidden_side_effect_retry",
    score: 0.86
  });
}

async function buildRepoDataset() {
  ensureCoreTaxonomy();
  const repoPath = path.resolve(option("--path", rootDir));
  const repoName = path.basename(repoPath);
  const repoId = `repo_${slug(repoName)}`;
  addRepository({ id: repoId, name: repoName, url: repoPath, primaryLanguage: "Mixed" });

  const files = await listCodeFiles(repoPath);
  const fileMap = new Map();

  for (const absolutePath of files) {
    const relativePath = path.relative(repoPath, absolutePath).replace(/\\/g, "/");
    const content = await fs.readFile(absolutePath, "utf8");
    const fileId = ensureFile(repoId, relativePath, content);
    fileMap.set(relativePath, { id: fileId, content });

    for (const fn of extractFunctions(content, relativePath)) {
      const functionId = `${fileId}_${slug(fn.name)}`;
      add("functions", { id: functionId, fileId, name: fn.name, kind: fn.kind });
      add("rel_file_functions", { fileId, functionId });
    }
  }

  for (const [relativePath, file] of fileMap) {
    for (const importName of extractImports(file.content)) {
      const target = resolveImport(relativePath, importName, fileMap);
      if (!target) continue;

      add("rel_file_imports", {
        sourceFileId: file.id,
        targetFileId: target.id,
        importName
      });

      const sourceModule = ensureModule(repoId, moduleNameForFile(relativePath), layerForFile(relativePath));
      const targetModule = ensureModule(repoId, moduleNameForFile(target.path), layerForFile(target.path));
      if (sourceModule !== targetModule) {
        add("rel_module_deps", {
          sourceModuleId: sourceModule,
          targetModuleId: targetModule,
          reason: `Import ${importName}`
        });
      }
    }
  }

  const prId = "LOCAL-PR-001";
  const changedFiles = [...fileMap.values()].slice(0, Math.min(8, fileMap.size));
  const riskScore = Math.min(95, 35 + changedFiles.filter((file) => /true/i.test(file.id)).length * 10 + changedFiles.length * 4);

  addPr({
    repoId,
    id: prId,
    number: 1,
    title: `Local architecture scan for ${repoName}`,
    author: "local-import",
    isAiAssisted: false,
    riskScore,
    url: repoPath
  });

  for (const file of changedFiles) {
    add("rel_pr_files", { prId, fileId: file.id });
  }
}

async function buildKaggleDataset() {
  ensureCoreTaxonomy();
  const csvPath = path.resolve(option("--csv", path.join(rawDir, "github-public-pull-request-comments.csv")));
  const repoId = "repo_kaggle_pr_comments";
  addRepository({
    id: repoId,
    name: "Kaggle GitHub Public Pull Request Comments",
    url: "https://www.kaggle.com/datasets/pelmers/github-public-pull-request-comments",
    primaryLanguage: "Mixed"
  });

  const rows = parseCsv(await fs.readFile(csvPath, "utf8")).slice(0, Number(option("--limit", 500)));

  for (const [index, row] of rows.entries()) {
    const prNumber = row.pull_request_number || row.pr_number || row.issue_number || row.number || `row_${index}`;
    const prId = `KAGGLE-PR-${slug(prNumber)}`;
    const filePath = row.path || row.file_path || row.filename || `unknown/file_${index}.txt`;
    const body = row.body || row.comment || row.review_comment || row.message || "";
    const reviewer = row.user_login || row.user || row.author || row.login || "unknown-reviewer";
    const fileId = ensureFile(repoId, filePath, body);

    if (!tables.pull_requests.some((pr) => pr.id === prId)) {
      addPr({
        repoId,
        id: prId,
        number: prNumber,
        title: row.title || `Pull request ${prNumber}`,
        author: row.pr_author || row.author_association || "unknown-author",
        state: row.state || "unknown",
        isAiAssisted: /copilot|generated|ai|llm/i.test(body),
        riskScore: scoreCommentRisk(body),
        url: row.html_url || row.pull_request_url || ""
      });
    }

    add("rel_pr_files", { prId, fileId });
    addReview({
      id: row.id ? `comment_${row.id}` : `comment_kaggle_${index}`,
      prId,
      reviewer,
      fileId,
      body: body.slice(0, 1800)
    });
  }
}

async function listCodeFiles(dir) {
  const ignored = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"]);
  const extensions = new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rb", ".cs"]);
  const output = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (extensions.has(path.extname(entry.name))) {
        output.push(absolutePath);
      }
    }
  }

  await walk(dir);
  return output.slice(0, Number(option("--limit", 300)));
}

function extractImports(content) {
  const imports = new Set();
  const patterns = [
    /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /from\s+([a-zA-Z0-9_.]+)/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function extractFunctions(content, filePath) {
  const functions = [];
  const patterns = [
    { kind: "function", regex: /function\s+([A-Za-z0-9_]+)/g },
    { kind: "function", regex: /const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g },
    { kind: "class", regex: /class\s+([A-Za-z0-9_]+)/g },
    { kind: "function", regex: /def\s+([A-Za-z0-9_]+)/g }
  ];

  for (const { kind, regex } of patterns) {
    for (const match of content.matchAll(regex)) {
      functions.push({ name: match[1], kind });
    }
  }

  if (functions.length === 0) {
    functions.push({ name: path.basename(filePath, path.extname(filePath)), kind: "file" });
  }

  return functions.slice(0, 40);
}

function resolveImport(sourcePath, importName, fileMap) {
  if (!importName.startsWith(".")) return null;

  const sourceDir = path.posix.dirname(sourcePath);
  const base = path.posix.normalize(path.posix.join(sourceDir, importName));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.py`,
    path.posix.join(base, "index.js"),
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx")
  ];

  for (const candidate of candidates) {
    if (fileMap.has(candidate)) {
      return { path: candidate, ...fileMap.get(candidate) };
    }
  }

  return null;
}

function scoreCommentRisk(text) {
  const issue = detectIssueType(text);
  const base = {
    security_sensitive_change: 85,
    architecture_coupling: 75,
    duplicate_logic: 62,
    maintainability: 52,
    review_concern: 38
  };
  return base[issue] || 40;
}

function parseCsv(text) {
  const rows = [];
  const parsed = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      parsed.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    parsed.push(row);
  }

  const headers = parsed.shift()?.map((header) => header.trim()) || [];
  for (const values of parsed) {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    rows.push(record);
  }

  return rows;
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function writeCsvs() {
  await fs.mkdir(processedDir, { recursive: true });

  for (const [name, headers] of Object.entries(csvHeaders)) {
    const rows = tables[name];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    ].join("\n");

    await fs.writeFile(path.join(processedDir, `${name}.csv`), `${csv}\n`, "utf8");
  }
}

async function main() {
  if (mode === "repo") {
    await buildRepoDataset();
  } else if (mode === "kaggle") {
    await buildKaggleDataset();
  } else {
    await buildSampleDataset();
  }

  await writeCsvs();

  const counts = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.length])
  );
  console.log(`Prepared ${mode} dataset in ${processedDir}`);
  console.table(counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
