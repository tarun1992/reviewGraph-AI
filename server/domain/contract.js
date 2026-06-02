// ReviewGraph AI - domain pack contract.
//
// The ReviewGraph AI implementation lives in a self-contained pack under
// domains/codereview/ that implements the interface below. The core server,
// seed runner, dataset runner, decks, and React UI program against these
// canonical shapes (Entity, Assessment, Evidence, Graph, Answer, Knowledge).
//
// A DomainPack default-exports an object shaped like:
//
//   {
//     meta:   DomainMeta,                         // branding + vocabulary
//     schema: { labels, relationships, constraints },
//     listEntities(): Entity[],
//     getEntity(id): { assessment: Assessment, graph: Graph } | null,
//     assess(id): Assessment | null,              // explainable, evidence-cited
//     ask(question, entityId): Answer,            // NL question routing
//     knowledge(): { categories: KnowledgeCategory[] },
//     seedStatements(): { query, params }[],      // seed Neo4j from the model
//     ingest(): { headers: Record<string,string[]>, tables: Record<string,object[]> },
//     persistAssessmentCypher: string,            // commit an assessment to memory
//     agentConfig: object                         // Aura agent (as code)
//   }
//
// ---------------------------------------------------------------------------
// Canonical shapes (documented as JSDoc typedefs)
// ---------------------------------------------------------------------------
//
// @typedef DomainMeta
//   id                string   - pack id, matches folder name
//   name              string   - product/display name
//   tagline           string   - one-line positioning
//   description       string
//   entityNoun        string   - e.g. "Pull Request", "Week"
//   entityNounPlural  string   - e.g. "Pull Requests", "Weeks"
//   scoreNoun         string   - e.g. "Risk", "Recovery"
//   brandColor        string   - hex, used by UI + decks
//   flagshipEntityId  string   - the entity to open by default
//   sampleQuestions   string[] - prompts shown in the UI
//   knowledgeCategories { id, title }[]  - memory tab columns
//
// @typedef Entity
//   id, title, subtitle, score (number), level (string),
//   tags string[], badges string[], evidenceCount number
//
// @typedef Cite        { type, id, label }
// @typedef Evidence    { kind, severity, title, detail, weight, cites: Cite[] }
// @typedef ImpactGroup { group, items: { id, label, meta? }[] }
//
// @typedef Assessment
//   entityId, title, level, score, summary,
//   impacts: ImpactGroup[], evidence: Evidence[], generatedAt
//
// @typedef Graph  { nodes: { id, label, group, ... }[], links: { source, target, type }[] }
// @typedef Answer { type, title, answer, evidence: string[], cypher }
// @typedef KnowledgeCategory { id, title, items: object[] }

export const SEVERITY_WEIGHT = { critical: 22, high: 18, medium: 10, low: 5 };

export function levelForScore(score) {
  if (score >= 85) return "Critical";
  if (score >= 65) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function cite(type, id, label) {
  return { type, id, label };
}

// Lightweight runtime validation used by the loader to fail fast on a
// malformed pack rather than throwing deep inside a request.
export function validatePack(pack, id) {
  const required = ["meta", "listEntities", "getEntity", "assess", "ask", "knowledge", "seedStatements", "ingest"];
  const missing = required.filter((key) => pack[key] === undefined);
  if (missing.length) {
    throw new Error(`Domain pack "${id}" is missing: ${missing.join(", ")}`);
  }
  if (!pack.meta?.id) {
    throw new Error(`Domain pack "${id}" is missing meta.id`);
  }
  return pack;
}
