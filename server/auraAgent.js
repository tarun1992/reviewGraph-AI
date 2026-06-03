// Neo4j Aura Agent REST client (hosted GenAI Text2Cypher + LLM).
//
// Enable in .env:
//   AURA_CLIENT_ID / AURA_CLIENT_SECRET  — API keys from Aura Console → Account → API Keys
//   AURA_AGENT_INVOKE_URL                — External invoke URL from Agents tab (…/invoke)
//   AURA_AGENT_MODE=primary|local|off  — default: primary when invoke URL is set
//
// Docs: https://neo4j.com/developer/genai-ecosystem/aura-agent-getting-started/

import "./loadEnv.js";

const TOKEN_URL = process.env.AURA_TOKEN_URL || "https://api.neo4j.io/oauth/token";
const MODES = new Set(["primary", "local", "off"]);

let tokenCache = { accessToken: null, expiresAt: 0 };

function readAuraEnv() {
  const clientId = process.env.AURA_CLIENT_ID;
  const clientSecret = process.env.AURA_CLIENT_SECRET;
  const invokeUrl = process.env.AURA_AGENT_INVOKE_URL;
  const mode = MODES.has(process.env.AURA_AGENT_MODE?.toLowerCase())
    ? process.env.AURA_AGENT_MODE.toLowerCase()
    : invokeUrl && clientId && clientSecret
      ? "primary"
      : "off";
  return { clientId, clientSecret, invokeUrl, mode };
}

/** Server-only — never serialize to API responses. */
export function getAuraAgentConfig() {
  const { clientId, clientSecret, invokeUrl, mode } = readAuraEnv();
  return {
    configured: !!(clientId && clientSecret && invokeUrl),
    mode,
    invokeUrl: invokeUrl || null
  };
}

export function isAuraAgentEnabled() {
  const { configured, mode } = getAuraAgentConfig();
  return configured && mode === "primary";
}

async function fetchAuraToken() {
  const clientId = process.env.AURA_CLIENT_ID;
  const clientSecret = process.env.AURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AURA_CLIENT_ID and AURA_CLIENT_SECRET are required.");
  }

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[ReviewGraph] Aura OAuth failed (${res.status}): ${body.slice(0, 200)}`);
    throw new Error("Aura OAuth authentication failed");
  }

  const data = await res.json();
  const accessToken = data.access_token;
  if (!accessToken) throw new Error("Aura OAuth response missing access_token.");

  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  };
  return accessToken;
}

/** Parse Aura invoke JSON into a UI-friendly answer shape. */
export function parseAuraAgentResponse(raw, { question, entityId } = {}) {
  const content = Array.isArray(raw?.content) ? raw.content : [];
  const textParts = [];
  const evidence = [];
  const reasoning = [];
  let cypher = "";
  const toolUses = [];

  for (const block of content) {
    const type = block?.type;
    if (type === "text" && block.text) {
      textParts.push(block.text);
    } else if (type === "thinking" && (block.thinking || block.text)) {
      reasoning.push(String(block.thinking || block.text).trim());
    } else if (type === "cypher_template_tool_use" || type === "text2cypher_tool_use") {
      toolUses.push(block);
      if (block.name) evidence.push(`Tool: ${block.name}`);
    } else if (type === "cypher_template_tool_result" || type === "text2cypher_tool_result") {
      const records = block.output?.records || [];
      for (const rec of records.slice(0, 8)) {
        evidence.push(JSON.stringify(rec));
      }
      if (block.output?.query && !cypher) cypher = block.output.query;
    }
  }

  if (!cypher && toolUses.length) {
    const last = toolUses[toolUses.length - 1];
    cypher = `// Aura tool: ${last.name || "unknown"}\n// ${JSON.stringify(last.input || {}, null, 2)}`;
  }

  return {
    type: "aura_agent",
    prId: entityId,
    question,
    title: raw?.status === "SUCCESS" ? "Aura Agent answer" : "Aura Agent response",
    answer: textParts.join("\n\n") || raw?.message || "No text response from Aura Agent.",
    evidence: evidence.length ? evidence : reasoning.length ? ["See agent reasoning for graph evidence."] : [],
    reasoning,
    cypher: cypher || "// Executed via Aura Agent tools (see evidence / reasoning)",
    aura: {
      status: raw?.status,
      endReason: raw?.end_reason,
      usage: raw?.usage,
      toolCount: toolUses.length
    },
  };
}

export function buildAuraAgentInput(question, entityId, agentContext = {}) {
  const q = String(question || "").trim();
  const parts = [];
  if (agentContext.repository) {
    parts.push(`Repository under review: ${agentContext.repository}.`);
  }
  if (agentContext.dataSource && agentContext.dataSource !== "demo") {
    parts.push(`Data was ingested from ${agentContext.dataSource} (configure via .env only).`);
  }
  if (entityId) {
    parts.push(
      `Focus on pull request "${entityId}". Use PullRequest.id = "${entityId}" when filtering.`
    );
  }
  if (agentContext.graphBrief) {
    parts.push(`Pre-computed graph assessment (authoritative — align your answer with this): ${agentContext.graphBrief}`);
  }
  parts.push(
    "Schema: Repository, PullRequest, File, Module, Service, Team, Developer, ReviewComment, AIChange, SecurityFinding, Incident, Decision, ADR, Lesson. PullRequest may have riskScore, riskLevel, hasGraphRisk."
  );
  return `${q}\n\n${parts.join(" ")}`;
}

export function formatAssessmentBrief(assessment) {
  if (!assessment) return null;
  const signals = (assessment.evidence || []).slice(0, 6).map((e) => e.title);
  return `score=${assessment.score} level=${assessment.level}; signals: ${signals.join("; ") || "none"}. ${assessment.summary || ""}`;
}

/**
 * Invoke the hosted Aura Agent. Throws on HTTP or agent errors.
 */
export async function invokeAuraAgent(question, entityId, agentContext = {}) {
  const { invokeUrl } = getAuraAgentConfig();
  if (!invokeUrl) throw new Error("AURA_AGENT_INVOKE_URL is not set.");

  const token = await fetchAuraToken();
  const input = buildAuraAgentInput(question, entityId, agentContext);
  const timeoutMs = Number(process.env.AURA_AGENT_TIMEOUT_MS) || 120_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ input }),
      signal: controller.signal
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[ReviewGraph] Aura Agent non-JSON (${res.status}): ${text.slice(0, 200)}`);
      throw new Error("Aura Agent returned an invalid response");
    }

    if (!res.ok) {
      console.error(`[ReviewGraph] Aura Agent invoke failed (${res.status}): ${text.slice(0, 200)}`);
      throw new Error("Aura Agent invoke failed");
    }

    if (data.status && data.status !== "SUCCESS") {
      console.error(`[ReviewGraph] Aura Agent status ${data.status}: ${data.message || ""}`);
      throw new Error("Aura Agent did not complete successfully");
    }

    return parseAuraAgentResponse(data, { question, entityId });
  } finally {
    clearTimeout(timer);
  }
}

/** Health probe: OAuth only (does not bill an LLM call). Returns server-internal shape. */
export async function getAuraAgentStatus() {
  const config = getAuraAgentConfig();
  if (!config.configured) {
    return { ...config, ready: false, reason: "not_configured" };
  }
  if (config.mode === "off") {
    return { ...config, ready: false, reason: "disabled" };
  }
  try {
    await fetchAuraToken();
    return { ...config, ready: true };
  } catch (error) {
    console.error("[ReviewGraph] Aura Agent health:", error.message);
    return { ...config, ready: false, reason: "authentication_failed" };
  }
}
