// Generates real .pptx decks for ReviewGraph AI.
//
//   npm run decks   ->   decks/dist/*.pptx
//
// Three decks: business overview, technical overview, getting started. Example
// slides are generated from the live code-review pack, so they stay in sync.

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import { loadDomainPack } from "../server/domain/loader.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "decks", "dist");

const THEME = {
  brand: "1D4ED8",
  brandAlt: "0F766E",
  dark: "0F172A",
  slate: "475569",
  light: "F1F5F9",
  white: "FFFFFF",
  font: "Segoe UI"
};

function newDeck(title, subject) {
  const pptx = new PptxGenJS();
  pptx.author = "ReviewGraph AI";
  pptx.company = "ReviewGraph AI";
  pptx.subject = subject;
  pptx.title = title;
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  pptx.defineSlideMaster({
    title: "MASTER",
    background: { color: THEME.white },
    objects: [
      { rect: { x: 0, y: 7.0, w: "100%", h: 0.5, fill: { color: THEME.light } } },
      { text: { text: "ReviewGraph AI", options: { x: 0.5, y: 7.0, w: 6, h: 0.5, fontSize: 9, color: THEME.slate, fontFace: THEME.font, valign: "middle" } } }
    ],
    slideNumber: { x: 12.4, y: 7.0, w: 0.7, h: 0.5, fontSize: 9, color: THEME.slate, fontFace: THEME.font }
  });
  return pptx;
}

function titleSlide(pptx, eyebrow, title, subtitle, accent = THEME.brand) {
  const s = pptx.addSlide({ masterName: "MASTER" });
  s.background = { color: THEME.dark };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: accent } });
  s.addText(eyebrow.toUpperCase(), { x: 0.9, y: 2.1, w: 11.5, h: 0.4, fontSize: 14, color: accent, bold: true, charSpacing: 2, fontFace: THEME.font });
  s.addText(title, { x: 0.85, y: 2.5, w: 11.6, h: 1.8, fontSize: 40, color: THEME.white, bold: true, fontFace: THEME.font });
  s.addText(subtitle, { x: 0.9, y: 4.3, w: 11.3, h: 1.2, fontSize: 18, color: "CBD5E1", fontFace: THEME.font });
  return s;
}

function header(s, pptx, title, accent = THEME.brand) {
  s.addText(title, { x: 0.6, y: 0.45, w: 12.1, h: 0.7, fontSize: 26, color: THEME.dark, bold: true, fontFace: THEME.font });
  s.addShape(pptx.ShapeType.rect, { x: 0.62, y: 1.18, w: 1.1, h: 0.06, fill: { color: accent } });
}

function bulletsSlide(pptx, title, bullets, accent = THEME.brand) {
  const s = pptx.addSlide({ masterName: "MASTER" });
  header(s, pptx, title, accent);
  s.addText(
    bullets.map((b) => (typeof b === "string"
      ? { text: b, options: { bullet: { code: "2022" }, fontSize: 17, color: THEME.dark, paraSpaceAfter: 10, fontFace: THEME.font } }
      : { text: b.text, options: { bullet: b.sub ? { indent: 20, code: "25AA" } : { code: "2022" }, indentLevel: b.sub ? 1 : 0, fontSize: b.sub ? 14 : 17, color: b.sub ? THEME.slate : THEME.dark, bold: !!b.bold, paraSpaceAfter: 8, fontFace: THEME.font } })),
    { x: 0.8, y: 1.6, w: 11.7, h: 5.1, valign: "top" }
  );
  return s;
}

function tableSlide(pptx, title, headRow, rows, accent = THEME.brand, colW) {
  const s = pptx.addSlide({ masterName: "MASTER" });
  header(s, pptx, title, accent);
  const head = headRow.map((t) => ({ text: t, options: { bold: true, color: THEME.white, fill: { color: accent }, fontSize: 13, fontFace: THEME.font, valign: "middle" } }));
  const body = rows.map((r, ri) => r.map((c) => ({ text: String(c), options: { fontSize: 12, color: THEME.dark, fill: { color: ri % 2 ? THEME.light : THEME.white }, fontFace: THEME.font, valign: "middle" } })));
  s.addTable([head, ...body], { x: 0.6, y: 1.5, w: 12.1, colW, border: { type: "solid", color: "E2E8F0", pt: 1 }, rowH: 0.4, autoPage: false });
  return s;
}

async function build() {
  await fs.mkdir(distDir, { recursive: true });
  const pack = await loadDomainPack("codereview");
  const meta = pack.meta;

  await buildBusiness(meta);
  await buildTechnical(meta);
  await buildGettingStarted(meta);
  console.log(`Decks written to ${distDir}`);
}

// ---------------------------------------------------------------------------
// Deck 1 - Business / "why this is useful"
// ---------------------------------------------------------------------------
async function buildBusiness(meta) {
  const pptx = newDeck("ReviewGraph AI - Business Overview", "Business overview");

  titleSlide(pptx, "ReviewGraph AI", "Explainable code review for the age of AI-written code", meta.tagline);

  bulletsSlide(pptx, "The problem", [
    "AI now writes a large and growing share of the code that reaches review.",
    "Most AI reviewers only see the current diff - not architecture, history, or incidents.",
    "Reviewers lack context: who owns this, what broke before, what decisions apply.",
    { text: "Result: risky AI-generated changes merge, and the same mistakes repeat.", bold: true }
  ]);

  bulletsSlide(pptx, "The idea", [
    "Model the engineering system as a knowledge graph: PRs, files, modules, services, deps.",
    "Put an Aura agent on top that reasons over those relationships and cites graph evidence.",
    "Add persistent memory so the agent learns from every review, incident, and decision.",
    { text: "Code review is a context problem - so we give the agent the full context.", bold: true }
  ]);

  bulletsSlide(pptx, "Diff-only vs. ReviewGraph AI", [
    { text: "Most AI reviewers see:", bold: true },
    { text: "the current diff.", sub: true },
    { text: "ReviewGraph AI sees:", bold: true },
    { text: "current diff + architecture + history + incidents + team knowledge + previous decisions.", sub: true },
    "Point it at any GitHub or GitLab repo with credentials only — same engine for every organization."
  ], THEME.brandAlt);

  tableSlide(pptx, "What it answers",
    ["Capability", "Question", "Powered by"],
    [
      ["Risk explanation", "Why is this PR risky?", "evidence-cited assessment"],
      ["Reviewer recommendation", "Who should review this?", "ownership + history + security"],
      ["Risk propagation", "What could break if it merges?", "PR -> services -> consumers"],
      ["Architectural compliance", "Does this violate our architecture?", "ADRs + forbidden deps"],
      ["Incident-aware review", "Has this caused problems before?", "incidents + historical PRs"]
    ], THEME.brand, [3.0, 4.6, 4.5]);

  bulletsSlide(pptx, "Business value", [
    { text: "Trust & adoption:", bold: true },
    { text: "every verdict is explainable with cited graph evidence.", sub: true },
    { text: "Lower risk:", bold: true },
    { text: "catch coupling regressions, blast radius, and policy violations before merge.", sub: true },
    { text: "Compounding knowledge:", bold: true },
    { text: "agent memory records decisions, lessons, and past assessments.", sub: true },
    { text: "Faster reviews:", bold: true },
    { text: "route PRs to the right reviewers automatically.", sub: true }
  ]);

  bulletsSlide(pptx, "Positioning", [
    { text: "ReviewGraph AI is an Aura-powered engineering intelligence agent that combines code relationships, architectural knowledge, and persistent memory to deliver explainable code reviews and impact analysis.", bold: true },
    "A bigger, more defensible product than a standalone AI code reviewer."
  ], THEME.brandAlt);

  await pptx.writeFile({ fileName: path.join(distDir, "01-business-overview.pptx") });
}

// ---------------------------------------------------------------------------
// Deck 2 - Technical overview
// ---------------------------------------------------------------------------
async function buildTechnical(meta) {
  const pptx = newDeck("ReviewGraph AI - Technical Overview", "Technical overview");

  titleSlide(pptx, "Technical overview", "How ReviewGraph AI works", "Three layers: Code Intelligence Graph, Aura Agent, and Agent Memory. Node.js, React, Neo4j, Cypher.", THEME.brandAlt);

  bulletsSlide(pptx, "Three-layer architecture", [
    { text: "Layer 1 - Code Intelligence Graph:", bold: true },
    { text: "Repository, PR, File, Module, Service, Dependency, ReviewComment, IssueType, RiskPattern, Developer.", sub: true },
    { text: "Layer 2 - Aura Agent (reasoning):", bold: true },
    { text: "User question -> Text2Cypher -> Neo4j query -> graph results -> LLM explanation.", sub: true },
    { text: "Layer 3 - Agent Memory:", bold: true },
    { text: "Past reviews, risk decisions, architecture decisions, incidents, reviewer feedback.", sub: true }
  ], THEME.brandAlt);

  tableSlide(pptx, "Graph schema",
    ["Layer", "Nodes", "Tells you"],
    [
      ["L1 Code & review", "PullRequest, File, Module, ReviewComment, AIChange", "What the AI changed and what reviewers flagged"],
      ["L2 Operations & org", "Service, Team, Incident, Deployment, ADR", "Impact, ownership, history, policy"],
      ["L3 Agent memory", "Decision, Lesson, RiskAssessment, Evidence", "What we learned and decided"]
    ], THEME.brand, [3.0, 5.6, 3.5]);

  bulletsSlide(pptx, "Enterprise workflow (a PR opens)", [
    { text: "1. Analyze the diff", bold: true },
    { text: "identify modified files, modules, and AI-introduced changes.", sub: true },
    { text: "2. Query the graph", bold: true },
    { text: "impacted services, reviewers, similar PRs, related incidents.", sub: true },
    { text: "3. Retrieve memory", bold: true },
    { text: "previous decisions, reviewer notes, architecture rules.", sub: true },
    { text: "4. Generate review report", bold: true },
    { text: "explainable verdict with cited graph evidence.", sub: true }
  ]);

  tableSlide(pptx, "Feature -> graph traversal",
    ["Feature", "Cypher tool", "Traversal"],
    [
      ["Reviewer recommendation", "recommend_reviewers", "PR -> File -> Service <- Team -> Developer"],
      ["Risk propagation", "risk_propagation", "PR -> Files -> Modules -> Services -> Consumers"],
      ["Architectural compliance", "architecture_compliance", "File -INTRODUCES-> Service <-FORBIDS- Decision -> ADR"],
      ["Incident-aware review", "related_incidents", "PR -> Services <- Incident"]
    ], THEME.brandAlt, [3.2, 3.4, 5.5]);

  bulletsSlide(pptx, "Explainable assessment engine", [
    "Each risk factor adds weighted evidence with a severity and graph citations.",
    "Score = base + sum(weights), clamped 0-100; level derived from score.",
    "No verdict without evidence - the summary lists the high-severity drivers.",
    "Impacts surface recommended reviewers and downstream services right in the assessment."
  ]);

  bulletsSlide(pptx, "Neo4j Aura agent (as code)", [
    "domains/codereview/agent.json defines the system prompt + tools.",
    "Tools: explain_pr_risk, recommend_reviewers, risk_propagation, architecture_compliance, related_incidents.",
    "Plus Text2Cypher for open-ended questions and similarity search over comments / patterns.",
    "Runs offline on an in-memory graph, or against Neo4j Aura when configured."
  ], THEME.brandAlt);

  await pptx.writeFile({ fileName: path.join(distDir, "02-technical-overview.pptx") });
}

// ---------------------------------------------------------------------------
// Deck 3 - Getting started
// ---------------------------------------------------------------------------
async function buildGettingStarted(meta) {
  const pptx = newDeck("ReviewGraph AI - Getting Started", "Getting started");

  titleSlide(pptx, "Getting started", "From clone to a running review agent", "Run the demo, explore the flagship PR, and deploy to Neo4j Aura.", THEME.brand);

  bulletsSlide(pptx, "1. Prerequisites", [
    "Node.js 20+ and npm.",
    "Optional: a Neo4j Aura (free tier) or Neo4j Desktop instance.",
    "No database needed for the demo - it runs on an in-memory graph."
  ]);

  bulletsSlide(pptx, "2. Install & run", [
    { text: "npm install", bold: true },
    { text: "installs app + deck dependencies.", sub: true },
    { text: "npm run dev", bold: true },
    { text: "starts the API (4000) and the React UI (5173).", sub: true },
    { text: "Open the UI", bold: true },
    { text: "explore Assessment, Ask the Graph, and Agent Memory tabs.", sub: true }
  ]);

  tableSlide(pptx, "3. Review any repository (GitHub or GitLab)",
    ["Provider", "Set in .env", "Notes"],
    [
      ["Demo", "(default)", "Built-in PR-512 scenario, no credentials"],
      ["GitHub", "GITHUB_REPO, GITHUB_TOKEN", "GitHub.com or Enterprise (GITHUB_API)"],
      ["GitLab", "GITLAB_PROJECT, GITLAB_TOKEN", "GitLab.com or self-hosted (GITLAB_API)"],
      ["Neo4j", "NEO4J_URI, USER, PASSWORD", "Any Bolt DB — Aura, Desktop, Docker"]
    ], THEME.brandAlt, [2.2, 4.8, 5.1]);

  bulletsSlide(pptx, "4. Demo flagship scenario", [
    { text: `Without repo credentials, open ${meta.flagshipEntityId}.`, bold: true },
    "BillingService -> AuthService coupling, Incident-47, ADR-7 — full evidence trail.",
    "With GITHUB_REPO or GITLAB_PROJECT set, the sidebar lists your real merge requests instead."
  ]);

  tableSlide(pptx, "5. Deploy to Neo4j Aura",
    ["Step", "Command / action"],
    [
      ["Configure", "Copy .env.example to .env; set NEO4J_URI / USER / PASSWORD"],
      ["Seed graph", "npm run seed"],
      ["Export CSVs", "npm run dataset   ->  data/processed/codereview/*.csv"],
      ["Bulk import", "Run domains/codereview/import.cypher in Aura (LOAD CSV)"],
      ["Deploy agent", "Push domains/codereview/agent.json via the Aura /agents API"],
      ["Verify", "npm run aura:verify"]
    ], THEME.brand, [2.6, 9.5]);

  bulletsSlide(pptx, "6. Roadmap", [
    { text: "Phase 1 - Foundation:", bold: true },
    { text: "PRs, Files, Modules, Dependencies, Text2Cypher (done).", sub: true },
    { text: "Phase 2 - Knowledge:", bold: true },
    { text: "reviewer knowledge, ADRs, incidents (done).", sub: true },
    { text: "Phase 3 - Memory:", bold: true },
    { text: "agent memory, historical reasoning, learning from reviews (in progress).", sub: true },
    { text: "Phase 4 - Autonomy:", bold: true },
    { text: "autonomous recommendations, risk scoring, architecture governance.", sub: true }
  ], THEME.brandAlt);

  bulletsSlide(pptx, "Where to look in the repo", [
    "server/index.js - the API (meta, entities, ask, assess, memory).",
    "domains/codereview/sources/ - github.js, gitlab.js, shared ingestion.",
    "domains/codereview/model.js - pluggable graph store + feature selectors.",
    "domains/codereview/assess.js - the explainable risk engine.",
    "domains/codereview/questions.js - Text2Cypher routing.",
    "domains/codereview/agent.json - the Aura agent defined as code.",
    "docs/product-context.md - the full product vision and graph model."
  ]);

  await pptx.writeFile({ fileName: path.join(distDir, "03-getting-started.pptx") });
}

build().catch((e) => { console.error(e); process.exit(1); });
