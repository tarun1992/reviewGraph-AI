// Generates real .pptx decks for ReviewGraph AI.
//
//   npm run decks   ->   decks/dist/*.pptx
//   DECKS_OUT=decks/dist-latest npm run decks   # alternate output folder
//
// Four decks: business, technical, getting started, how PR analysis works.
// Slides are generated from the live code-review pack so they stay in sync.

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import { loadDomainPack } from "../server/domain/loader.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.DECKS_OUT
  ? path.resolve(rootDir, process.env.DECKS_OUT)
  : path.join(rootDir, "decks", "dist");

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

// ---------------------------------------------------------------------------
// Architecture diagram slides (native shapes — mirrors docs/ARCHITECTURE.md)
// ---------------------------------------------------------------------------

function diagramSlide(pptx, title, draw, accent = THEME.brand) {
  const s = pptx.addSlide({ masterName: "MASTER" });
  header(s, pptx, title, accent);
  draw(s, pptx);
  return s;
}

function diagramBox(s, pptx, x, y, w, h, label, fill, opts = {}) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: opts.border || THEME.slate, width: 1 },
    rectRadius: 0.06
  });
  s.addText(label, {
    x, y, w, h,
    fontSize: opts.fontSize || 10,
    color: opts.color || THEME.dark,
    align: "center",
    valign: "middle",
    fontFace: THEME.font,
    bold: !!opts.bold
  });
}

function diagramArrow(s, pptx, x, y, w, h, color = THEME.brand) {
  s.addShape(pptx.ShapeType.line, {
    x, y, w, h,
    line: { color, width: 2, endArrowType: "triangle" }
  });
}

function slideDiagramSystemContext(pptx) {
  diagramSlide(pptx, "Architecture — system context", (s, pptx) => {
    diagramBox(s, pptx, 0.7, 1.55, 1.5, 0.55, "Developer", THEME.light);
    diagramBox(s, pptx, 0.55, 2.35, 1.9, 0.7, "GitHub\nGitLab", "E0E7FF", { fontSize: 9 });
    diagramBox(s, pptx, 2.9, 1.45, 4.2, 2.7, "ReviewGraph AI\nAPI :4000 + UI :5173\nIngest · Assess · Ask", THEME.brand, { color: THEME.white, fontSize: 11, bold: true });
    diagramBox(s, pptx, 7.5, 1.55, 2.5, 0.9, "Neo4j\n(any Bolt)", "D1FAE5", { fontSize: 10 });
    diagramBox(s, pptx, 10.4, 1.55, 2.4, 0.9, "Aura Agent\n(optional LLM)", "CCFBF1", { fontSize: 9 });
    diagramArrow(s, pptx, 2.45, 1.82, 0.45, 0);
    diagramArrow(s, pptx, 2.45, 2.7, 0.45, 0);
    diagramArrow(s, pptx, 7.1, 2.0, 0.4, 0);
    diagramArrow(s, pptx, 10.0, 2.0, 0.4, 0);
    diagramArrow(s, pptx, 11.6, 2.45, 0, 0.35);
    s.addText("Generic: any GitHub/GitLab repo + any Neo4j — configured in .env only", {
      x: 0.7, y: 4.35, w: 12, h: 0.4, fontSize: 11, color: THEME.slate, fontFace: THEME.font, italic: true
    });
  }, THEME.brandAlt);
}

function slideDiagramThreeLayers(pptx) {
  diagramSlide(pptx, "Architecture — three layers", (s, pptx) => {
    const layers = [
      { y: 1.5, label: "Layer 3 — Agent Memory", sub: "Decision · Lesson · Incident · RiskAssessment · Evidence", fill: "FEF3C7" },
      { y: 2.55, label: "Layer 2 — Aura Agent", sub: "Question → Text2Cypher / tools → Cypher → Results → Explanation", fill: "CCFBF1" },
      { y: 3.6, label: "Layer 1 — Code Intelligence Graph", sub: "PR · File · Module · Service · Developer · ReviewComment", fill: "DBEAFE" }
    ];
    for (const L of layers) {
      diagramBox(s, pptx, 0.8, L.y, 11.7, 0.85, `${L.label}\n${L.sub}`, L.fill, { fontSize: 10 });
    }
    diagramArrow(s, pptx, 6.35, 3.35, 0, -0.35);
    diagramArrow(s, pptx, 6.35, 2.4, 0, -0.35);
    s.addText("Layer 2 runs in-app (questions.js) or hosted Aura Console (agent.json)", {
      x: 0.8, y: 4.55, w: 11.5, h: 0.35, fontSize: 10, color: THEME.slate, fontFace: THEME.font
    });
  }, THEME.brand);
}

function slideDiagramIngestion(pptx) {
  diagramSlide(pptx, "Architecture — ingestion pipeline", (s, pptx) => {
    const boxes = [
      [0.6, "GitHub / GitLab\nREST API"],
      [2.55, "github.js\ngitlab.js"],
      [4.5, "shared.js\nbuild dataset"],
      [6.45, "model.js\napplyDataset"],
      [8.4, "assess.js\nquestions.js"],
      [10.35, "npm run seed\nNeo4j"]
    ];
    let x = 0.55;
    for (const [, label] of boxes) {
      diagramBox(s, pptx, x, 2.2, 1.75, 1.0, label, THEME.light, { fontSize: 9 });
      if (x < 10) diagramArrow(s, pptx, x + 1.75, 2.65, 0.35, 0);
      x += 2.1;
    }
    diagramBox(s, pptx, 0.55, 1.45, 1.6, 0.5, ".env", "E0E7FF", { fontSize: 10, bold: true });
    diagramArrow(s, pptx, 1.35, 1.95, 0, 0.25);
    s.addText("CODEOWNERS + docs/reviewgraph-config.json (full file from PR head branch)", {
      x: 0.6, y: 3.5, w: 12, h: 0.35, fontSize: 10, color: THEME.slate, fontFace: THEME.font
    });
  }, THEME.brandAlt);
}

function slideDiagramAskFlow(pptx) {
  diagramSlide(pptx, "Architecture — Ask the Graph flow", (s, pptx) => {
    diagramBox(s, pptx, 0.55, 2.0, 1.35, 0.65, "React UI\nAsk tab", THEME.light);
    diagramBox(s, pptx, 2.05, 2.0, 1.45, 0.65, "POST\n/api/ask", THEME.light);
    diagramBox(s, pptx, 3.65, 1.85, 2.0, 0.95, "auraAgent.js\nOAuth + invoke", THEME.brand, { color: THEME.white, fontSize: 9 });
    diagramBox(s, pptx, 5.8, 2.0, 1.55, 0.65, "Aura Agent\nText2Cypher", "CCFBF1", { fontSize: 9 });
    diagramBox(s, pptx, 7.5, 2.0, 1.5, 0.65, "Neo4j\nAura DB", "D1FAE5", { fontSize: 10 });
    diagramBox(s, pptx, 9.15, 2.0, 1.55, 0.65, "LLM +\nevidence", THEME.light);
    diagramBox(s, pptx, 10.85, 1.9, 1.65, 0.85, "Fallback:\nquestions.js", THEME.light, { fontSize: 8 });
    for (let i = 0; i < 4; i++) diagramArrow(s, pptx, 1.9 + i * 1.75, 2.32, 0.3, 0);
    diagramArrow(s, pptx, 10.75, 2.75, 0, 0.35);
    diagramArrow(s, pptx, 10.75, 2.55, -0.35, 0);
    s.addText("Live: Aura Agent in-app when AURA_* keys are set; credentials stay on server", {
      x: 0.55, y: 3.35, w: 12, h: 0.5, fontSize: 11, color: THEME.dark, fontFace: THEME.font, bold: true
    });
    s.addText("UI shows Aura Live + Neo4j Connected; sanitized JSON only to browser", {
      x: 0.55, y: 3.85, w: 12, h: 0.35, fontSize: 10, color: THEME.slate, fontFace: THEME.font
    });
  }, THEME.brand);
}

function slideDiagramAuraDualPath(pptx) {
  diagramSlide(pptx, "Architecture — Aura Agent integration", (s, pptx) => {
    diagramBox(s, pptx, 0.55, 1.5, 5.8, 2.5, "", THEME.light);
    diagramBox(s, pptx, 0.7, 1.65, 5.4, 0.45, "Path A — In-app (live Aura + Neo4j)", THEME.brand, { color: THEME.white, fontSize: 10, bold: true });
    diagramBox(s, pptx, 0.85, 2.2, 1.0, 0.55, "UI", THEME.white);
    diagramBox(s, pptx, 1.95, 2.2, 1.1, 0.55, "/api/ask", THEME.white);
    diagramBox(s, pptx, 3.15, 2.2, 1.25, 0.55, "auraAgent", THEME.brand, { color: THEME.white, fontSize: 8 });
    diagramBox(s, pptx, 4.5, 2.2, 1.2, 0.55, "Aura API", "CCFBF1", { fontSize: 9 });
    diagramBox(s, pptx, 5.8, 2.2, 0.9, 0.55, "Neo4j", "D1FAE5", { fontSize: 9 });
    for (let i = 0; i < 4; i++) diagramArrow(s, pptx, 1.85 + i * 1.1, 2.47, 0.08, 0);

    diagramBox(s, pptx, 6.85, 1.5, 5.9, 2.5, "", THEME.light);
    diagramBox(s, pptx, 7.0, 1.65, 5.5, 0.45, "Path B — Aura Console UI", THEME.brandAlt, { color: THEME.white, fontSize: 11, bold: true });
    diagramBox(s, pptx, 7.15, 2.2, 1.3, 0.55, "seed", THEME.white);
    diagramBox(s, pptx, 8.55, 2.2, 1.45, 0.55, "Aura Agent", "CCFBF1");
    diagramBox(s, pptx, 10.1, 2.2, 1.35, 0.55, "Text2Cypher\n+ tools", "CCFBF1", { fontSize: 8 });
    diagramBox(s, pptx, 11.55, 2.2, 1.0, 0.55, "LLM", THEME.white);
    for (let i = 0; i < 3; i++) diagramArrow(s, pptx, 8.45 + i * 1.45, 2.47, 0.12, 0);

    s.addText("agent.json = same tools; AURA_* secrets only in server .env", {
      x: 0.55, y: 4.2, w: 12, h: 0.35, fontSize: 11, color: THEME.slate, fontFace: THEME.font, italic: true
    });
  }, THEME.brandAlt);
}

function slideDiagramDeploy(pptx) {
  diagramSlide(pptx, "Architecture — deploy flow", (s, pptx) => {
    const steps = [".env Neo4j", "AURA_* keys", "npm run dev", "npm run seed", "Ask the Graph"];
    let x = 0.5;
    for (let i = 0; i < steps.length; i++) {
      diagramBox(s, pptx, x, 2.15, 2.35, 0.75, steps[i], i % 2 ? THEME.light : "DBEAFE", { fontSize: 9 });
      if (i < steps.length - 1) diagramArrow(s, pptx, x + 2.35, 2.5, 0.25, 0);
      x += 2.6;
    }
    diagramBox(s, pptx, 0.5, 1.45, 12.3, 0.5, "Credentials → Ingest → Graph → Optional hosted Aura Agent", "E0E7FF", { fontSize: 10 });
  }, THEME.brand);
}

async function build() {
  await fs.mkdir(distDir, { recursive: true });
  const pack = await loadDomainPack("codereview");
  const meta = pack.meta;

  await buildBusiness(meta);
  await buildTechnical(meta);
  await buildGettingStarted(meta);
  await buildPrAnalysis(meta);
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

  slideDiagramSystemContext(pptx);

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

  slideDiagramThreeLayers(pptx);
  slideDiagramSystemContext(pptx);
  slideDiagramIngestion(pptx);
  slideDiagramAskFlow(pptx);
  slideDiagramAuraDualPath(pptx);

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

  tableSlide(pptx, "Where to enter configuration",
    ["What", "Where", "Examples"],
    [
      ["GitHub repo", ".env", "GITHUB_REPO, GITHUB_TOKEN, GITHUB_API"],
      ["GitLab project", ".env", "GITLAB_PROJECT, GITLAB_TOKEN, GITLAB_API"],
      ["Neo4j database", ".env", "NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD"],
      ["Your ADRs / rules", "Target repo root", ".reviewgraph.json"],
      ["Ownership", "Target repo", "CODEOWNERS / .gitlab/CODEOWNERS"],
      ["Hosted Aura Agent", "Server .env + Console", "AURA_CLIENT_ID, SECRET, INVOKE_URL"],
      ["Aura Console UI", "Agents playground", "agent.json + aura-console-agent-setup.md"],
      ["Ask in app", "Ask the Graph tab", "Live Aura via server/auraAgent.js — no secrets in browser"]
    ], THEME.brand, [2.4, 3.2, 6.5]);

  bulletsSlide(pptx, "Live Neo4j + Aura in this app", [
    { text: "Neo4j: live Bolt queries when NEO4J_URI is set (UI: Neo4j Connected).", bold: true },
    { text: "Aura Agent: live invoke via server/auraAgent.js when AURA_* keys are set (UI: Aura Live).", bold: true },
    { text: "Fallback: questions.js rule-based Text2Cypher if Aura is unavailable.", sub: true },
    { text: "Security: credentials in .env only; clientSafe.js sanitizes API responses.", sub: true }
  ], THEME.brandAlt);

  bulletsSlide(pptx, "Implementation & ADRs", [
    "docs/IMPLEMENTATION.md — full feature checklist (done vs planned).",
    "docs/CONFIGURATION.md — credentials and entry points.",
    "docs/adr/ — ADR-001 Neo4j, ADR-002 VCS, ADR-003 evidence, ADR-004 Aura, ADR-005 memory, ADR-006 fallback."
  ]);

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
    { text: "API :4000 + UI :5173 (Vite proxies /api — no CORS issues).", sub: true },
    { text: "Open http://127.0.0.1:5173", bold: true },
    { text: "Assessment · Ask the Graph · Graph Evidence (zoom/pan) · Memory.", sub: true }
  ]);

  slideDiagramDeploy(pptx);
  slideDiagramSystemContext(pptx);

  tableSlide(pptx, "3. Review any repository (GitHub or GitLab)",
    ["Provider", "Set in .env", "Notes"],
    [
      ["Demo", "(default)", "Built-in PR-512 scenario, no credentials"],
      ["GitHub", "GITHUB_REPO, GITHUB_TOKEN", "GitHub.com or Enterprise (GITHUB_API)"],
      ["GitLab", "GITLAB_PROJECT, GITLAB_TOKEN", "GitLab.com or self-hosted (GITLAB_API)"],
      ["Neo4j", "NEO4J_URI, USER, PASSWORD", "Any Bolt DB — Aura, Desktop, Docker"]
    ], THEME.brandAlt, [2.2, 4.8, 5.1]);

  bulletsSlide(pptx, "4. Demo scenarios", [
    { text: "Demo mode (no .env): flagship PR-512 — billing/auth coupling + incident.", bold: true },
    { text: "Live GitHub: set GITHUB_REPO + token → Refresh → pick your riskiest open PR.", sub: true },
    { text: `Current flagship from ingest: ${meta.flagshipEntityId}.`, sub: true },
    "Example live demo: PR-9 export handoff — Critical 100 with 16 evidence signals."
  ]);

  bulletsSlide(pptx, "5. Enable live Aura Agent in the app", [
    "Aura Console → Account → API Keys → Client ID + Secret (secret shown once).",
    "Agents → ReviewGraph AI → External access → copy invoke URL to AURA_AGENT_INVOKE_URL.",
    "npm run dev → header shows Aura Live + Neo4j Connected → Ask the Graph tab.",
    "See docs/AURA_LIVE_INTEGRATION.md and SUBMISSION.md for evaluators."
  ], THEME.brandAlt);

  tableSlide(pptx, "6. Deploy to Neo4j Aura",
    ["Step", "Command / action"],
    [
      ["Configure", "Copy .env.example to .env; set NEO4J_URI / USER / PASSWORD"],
      ["Seed graph", "npm run seed"],
      ["Export CSVs", "npm run dataset   ->  data/processed/codereview/*.csv"],
      ["Bulk import", "Run domains/codereview/import.cypher in Aura (LOAD CSV)"],
      ["Deploy agent", "Push domains/codereview/agent.json via the Aura /agents API"],
      ["Verify", "npm run aura:verify"]
    ], THEME.brand, [2.6, 9.5]);

  bulletsSlide(pptx, "7. Roadmap", [
    { text: "Phase 1 - Foundation:", bold: true },
    { text: "PRs, Files, Modules, Dependencies, Text2Cypher (done).", sub: true },
    { text: "Phase 2 - Knowledge:", bold: true },
    { text: "reviewer knowledge, ADRs, incidents (done).", sub: true },
    { text: "Phase 3 - Memory:", bold: true },
    { text: "agent memory, historical reasoning, learning from reviews (in progress).", sub: true },
    { text: "Phase 4 - Autonomy:", bold: true },
    { text: "autonomous recommendations, risk scoring, architecture governance.", sub: true }
  ], THEME.brandAlt);

  bulletsSlide(pptx, "Documentation map", [
    "docs/GETTING_STARTED.md — install, live repo, Aura, decks.",
    "docs/GENERIC_REPO_SETUP.md — any GitHub/GitLab repo via .env only.",
    "docs/AURA_LIVE_INTEGRATION.md — in-app Aura + Neo4j.",
    "04-how-pr-analysis-works.pptx — sales/demo script for evaluators.",
    "SUBMISSION.md — challenge summary + screenshot checklist."
  ]);

  await pptx.writeFile({ fileName: path.join(distDir, "03-getting-started.pptx") });
}

// ---------------------------------------------------------------------------
// Deck 4 - How PR analysis works (sales + demo)
// ---------------------------------------------------------------------------
async function buildPrAnalysis(meta) {
  const pptx = newDeck(
    "ReviewGraph AI - How PR Analysis Works",
    "End-to-end PR analysis, evidence, and convincing users"
  );

  titleSlide(
    pptx,
    "How ReviewGraph analyzes a PR",
    "From GitHub/GitLab diff to explainable risk score",
    "Generic ingest · org rules in repo · graph evidence · Aura Agent",
    THEME.brandAlt
  );

  bulletsSlide(pptx, "One-line pitch", [
    "ReviewGraph turns code review into a graph problem — not a diff-only LLM prompt.",
    "It ingests the PR, maps files to architecture, applies your incidents/ADRs, scores risk with cited evidence, syncs to Neo4j, and answers why in plain language."
  ]);

  slideDiagramIngestion(pptx);

  tableSlide(
    pptx,
    "Step 1 — What we fetch (any repo via .env)",
    ["Source", "Data"],
    [
      ["PR metadata", "Title, author, state, changed files"],
      ["Patches", "Every + line — imports, secrets, coupling"],
      ["Reviews", "Comments and reviewers when present"],
      ["Repo rules", "docs/reviewgraph-config.json, CODEOWNERS"],
      ["History", "Prior reverted PRs, incidents, lessons from config"]
    ],
    THEME.brand,
    [3.2, 8.9]
  );

  bulletsSlide(pptx, "Step 2 — Automatic architecture map", [
    "Each file path → module → service (e.g. etl/export_handoff.py → etl → etl).",
    "No manual modeling per repository.",
    "Org rules mark security-sensitive paths and forbidden dependencies (ETL must not call iOS)."
  ], THEME.brandAlt);

  tableSlide(
    pptx,
    "Step 3 — Eight evidence signals (explainable score)",
    ["Signal", "Example"],
    [
      ["Security-sensitive files", "Changes under etl/** or auth paths"],
      ["Security findings", "Credential logging in patch"],
      ["Risk patterns", "Cross-layer shortcut, coupling regression"],
      ["Architecture violation", "Breaks ADR / decision in config"],
      ["Similar historical PR", "Same change as reverted PR-412"],
      ["Coupling regression", "ETL → iOS after past incident"],
      ["Blast radius", "Downstream services may break"],
      ["Lessons", "Postmortem applies to this module"]
    ],
    THEME.brand,
    [4.2, 7.9]
  );

  bulletsSlide(pptx, "Step 4 — Graph visualization (USP)", [
    "Columns: Change → Files → Services → Incidents → Policies → Lessons.",
    "Red paths = violations, forbidden dependencies, linked incidents.",
    "Zoom: scroll wheel · pan drag · toolbar +/- · fit · double-click reset.",
    "Wrapped node labels — readable evidence graph, not tiny in-circle text."
  ]);

  slideDiagramAskFlow(pptx);

  bulletsSlide(pptx, "Aura Agent + Neo4j", [
    "Same graph synced to Neo4j: riskScore, riskLevel, AIChange, SecurityFinding.",
    "Aura Text2Cypher answers Ask the Graph questions.",
    "Local engine assessment is injected so answers match the UI score.",
    "Update Aura Console tools from domains/codereview/agent.json."
  ], THEME.brandAlt);

  tableSlide(
    pptx,
    "Why users adopt it",
    ["Persona", "Message"],
    [
      ["Engineering manager", "Scale review without missing repeat failures"],
      ["Architect", "ADRs enforced at PR time with audit trail"],
      ["Security", "Sensitive paths + findings tied to files"],
      ["SRE", "Incidents and blast radius before merge"],
      ["Developer", "Actionable why — not generic lint noise"]
    ],
    THEME.brandAlt,
    [2.8, 9.2]
  );

  bulletsSlide(pptx, "10-minute demo script", [
    { text: "1.", bold: true },
    { text: "Show .env only — GITHUB_REPO, no code fork.", sub: true },
    { text: "2.", bold: true },
    { text: "Refresh → PR-9 Unify export handoff (Critical 100, subtle title).", sub: true },
    { text: "3.", bold: true },
    { text: "Risk Assessment — walk 3 evidence cards.", sub: true },
    { text: "4.", bold: true },
    { text: "Graph Evidence — red path to incident + reverted PR.", sub: true },
    { text: "5.", bold: true },
    { text: "Ask: Why is this PR risky? — engine + Aura aligned.", sub: true }
  ]);

  bulletsSlide(pptx, "Honest boundaries", [
    "Needs GitHub/GitLab token; rich analysis needs reviewgraph-config.json in the repo.",
    "Complements tests and linters — adds organizational memory and explainability.",
    "Aura Console Cypher should match repo agent.json for full parity."
  ]);

  await pptx.writeFile({ fileName: path.join(distDir, "04-how-pr-analysis-works.pptx") });
}

build().catch((e) => { console.error(e); process.exit(1); });
