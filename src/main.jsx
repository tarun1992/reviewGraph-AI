import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Code2,
  Layers,
  Network,
  Play,
  Save,
  Sparkles
} from "lucide-react";
import "./styles.css";

const API_URL = "http://127.0.0.1:4000";
const levelClass = (level) => (level || "").toLowerCase();

const DEFAULT_META = {
  name: "Graph Agent Blueprint",
  tagline: "Domain-agnostic graph intelligence",
  entityNoun: "Entity",
  entityNounPlural: "Entities",
  scoreNoun: "Risk",
  brandColor: "#1d4ed8",
  sampleQuestions: [],
  knowledgeCategories: []
};

function App() {
  const [meta, setMeta] = useState(DEFAULT_META);
  const [entities, setEntities] = useState([]);
  const [status, setStatus] = useState({ neo4j: "checking" });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("assessment");
  const [memory, setMemory] = useState({ categories: [], assessments: [] });
  const [committing, setCommitting] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    async function load() {
      const [metaRes, healthRes, entitiesRes, memoryRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/meta`),
        fetch(`${API_URL}/api/health`),
        fetch(`${API_URL}/api/entities`),
        fetch(`${API_URL}/api/memory`)
      ]);
      if (metaRes.status === "fulfilled") {
        const m = await metaRes.value.json();
        setMeta({ ...DEFAULT_META, ...m });
        setQuestion((q) => q || m.sampleQuestions?.[0] || "");
      }
      if (healthRes.status === "fulfilled") setStatus(await healthRes.value.json());
      if (memoryRes.status === "fulfilled") setMemory(await memoryRes.value.json());
      if (entitiesRes.status === "fulfilled") {
        const data = await entitiesRes.value.json();
        setEntities(data);
        setSelectedId((current) => current || data[0]?.id || null);
      }
    }
    load();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", meta.brandColor);
    document.title = meta.name;
  }, [meta]);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`${API_URL}/api/entities/${selectedId}`)
      .then((res) => res.json())
      .then(setDetail)
      .catch(() => setDetail(null));
    setAnswer(null);
  }, [selectedId]);

  const assessment = detail?.assessment;
  const graph = detail?.graph || { nodes: [], links: [] };
  const selectedEntity = entities.find((e) => e.id === selectedId);

  async function askQuestion(nextQuestion = question) {
    setQuestion(nextQuestion);
    setAsking(true);
    setTab("ask");
    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, entityId: selectedId })
      });
      setAnswer(await res.json());
    } catch {
      setAnswer({ title: "Offline", answer: "The API is unavailable.", evidence: [], cypher: "" });
    } finally {
      setAsking(false);
    }
  }

  async function commitAssessment() {
    if (!selectedId) return;
    setCommitting(true);
    try {
      await fetch(`${API_URL}/api/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: selectedId })
      });
      const memoryRes = await fetch(`${API_URL}/api/memory`);
      setMemory(await memoryRes.json());
    } finally {
      setCommitting(false);
    }
  }

  return (
    <main className="app-shell">
      <Header meta={meta} status={status} />
      <section className="workspace">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-heading">
              <Layers size={18} />
              <h2>{meta.entityNounPlural}</h2>
            </div>
            <div className="pr-list">
              {entities.map((entity) => (
                <button
                  className={`pr-row ${entity.id === selectedId ? "active" : ""}`}
                  key={entity.id}
                  onClick={() => setSelectedId(entity.id)}
                >
                  <span>
                    <strong>{entity.title}</strong>
                    <small>{entity.subtitle}</small>
                  </span>
                  <em className={`risk-pill ${levelClass(entity.level)}`}>{entity.score}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="panel compact">
            <div className="panel-heading">
              <Sparkles size={18} />
              <h2>Signals</h2>
            </div>
            <SignalList entity={selectedEntity} assessment={assessment} scoreNoun={meta.scoreNoun} />
          </div>
        </aside>

        <section className="main-column">
          <ReviewBand meta={meta} assessment={assessment} />

          <div className="tabs">
            <TabButton id="assessment" active={tab} onClick={setTab} icon={<AlertTriangle size={16} />} label={`${meta.scoreNoun} Assessment`} />
            <TabButton id="ask" active={tab} onClick={setTab} icon={<BrainCircuit size={16} />} label="Ask the Graph" />
            <TabButton id="memory" active={tab} onClick={setTab} icon={<BookOpen size={16} />} label="Agent Memory" />
          </div>

          {tab === "assessment" && (
            <AssessmentTab assessment={assessment} onCommit={commitAssessment} committing={committing} status={status} />
          )}
          {tab === "ask" && (
            <AskTab
              meta={meta}
              question={question}
              setQuestion={setQuestion}
              answer={answer}
              asking={asking}
              onAsk={askQuestion}
            />
          )}
          {tab === "memory" && <MemoryTab memory={memory} meta={meta} />}

          <section className="graph-section">
            <div className="section-heading">
              <Network size={19} />
              <h2>Graph Evidence</h2>
            </div>
            <GraphCanvas graph={graph} selectedId={selectedId} brand={meta.name} />
            <GraphLegend />
          </section>
        </section>
      </section>
    </main>
  );
}

function Header({ meta, status }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>{meta.name}</strong>
          <span>{meta.tagline}</span>
        </div>
      </div>
      <div className="topbar-right">
        {meta.dataSource && meta.dataSource !== "demo" && (
          <span className="domain-badge" title={meta.repository?.url || ""}>
            <Layers size={13} /> {meta.dataSource}
            {meta.repository?.name ? ` · ${meta.repository.name}` : ""}
          </span>
        )}
        {meta.sourceError && (
          <span className="domain-badge" title={meta.sourceError} style={{ borderColor: "var(--warn)" }}>
            source fallback
          </span>
        )}
        <div className={`db-status ${status.neo4j === "connected" ? "connected" : "fallback"}`}>
          {status.neo4j === "connected" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
          Neo4j {status.neo4j}
        </div>
      </div>
    </header>
  );
}

function SignalList({ entity, assessment, scoreNoun }) {
  if (!entity) return null;
  return (
    <div className="signals">
      <Signal label={scoreNoun} value={`${entity.score} · ${entity.level}`} />
      <Signal label="Detail" value={entity.subtitle} />
      <Signal label="Tags" value={entity.tags?.join(", ") || "—"} />
      <Signal label="Status" value={entity.badges?.join(", ") || "—"} />
      <Signal label="Evidence items" value={assessment?.evidence?.length ?? entity.evidenceCount ?? 0} />
    </div>
  );
}

function Signal({ label, value }) {
  return (
    <div className="signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReviewBand({ meta, assessment }) {
  return (
    <section className="review-band">
      <div>
        <p className="eyebrow">Explainable {meta.scoreNoun.toLowerCase()} assessment</p>
        <h1>{assessment?.title || meta.name}</h1>
        <p className="intro">{assessment?.summary || `Select a ${meta.entityNoun.toLowerCase()} to see graph-backed reasoning.`}</p>
      </div>
      <div className={`score-tile ${levelClass(assessment?.level)}`}>
        <span>{meta.scoreNoun}</span>
        <strong>{assessment?.score ?? "—"}</strong>
        <small>{assessment?.level || ""}</small>
      </div>
    </section>
  );
}

function TabButton({ id, active, onClick, icon, label }) {
  return (
    <button className={`tab ${active === id ? "active" : ""}`} onClick={() => onClick(id)}>
      {icon}
      {label}
    </button>
  );
}

function AssessmentTab({ assessment, onCommit, committing, status }) {
  if (!assessment) return <div className="panel">No assessment available.</div>;
  return (
    <section className="result-stack">
      <article className="panel">
        <div className="panel-heading spread">
          <span className="heading-left">
            <Layers size={18} />
            <h2>Impact</h2>
          </span>
          <button className="run-button" onClick={onCommit} disabled={committing}>
            <Save size={16} />
            {committing ? "Saving" : "Commit to memory"}
          </button>
        </div>
        <div className="chip-section">
          {assessment.impacts.filter((g) => g.items.length).map((group) => (
            <div className="chip-group" key={group.group}>
              <span className="chip-label">{group.group}</span>
              <div className="chips">
                {group.items.map((item) => (
                  <span className={`chip ${item.meta === "sensitive" || item.meta === "high" || item.meta === "low" ? "crit-high" : ""}`} key={item.id} title={item.meta || ""}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <AlertTriangle size={18} />
          <h2>Evidence ({assessment.evidence.length})</h2>
        </div>
        <div className="evidence-list">
          {assessment.evidence.map((item, i) => (
            <div className={`evidence-card sev-${item.severity}`} key={i}>
              <div className="evidence-top">
                <span className={`sev-badge sev-${item.severity}`}>{item.severity}</span>
                <strong>{item.title}</strong>
                <span className="weight">+{item.weight}</span>
              </div>
              <p>{item.detail}</p>
              <div className="cites">
                {item.cites.map((c, j) => (
                  <span className="cite" key={j} title={c.label}>
                    <em>{c.type}</em> {c.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {status.neo4j !== "connected" && (
          <p className="hint">Running on the in-memory graph. Configure Neo4j and run <code>npm run seed</code> to persist assessments to the database.</p>
        )}
      </article>
    </section>
  );
}

function AskTab({ meta, question, setQuestion, answer, asking, onAsk }) {
  return (
    <section className="result-stack">
      <section className="query-panel">
        <div className="question-row">
          <BrainCircuit size={20} />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAsk()}
            aria-label={`Ask ${meta.name}`}
          />
          <button className="run-button" onClick={() => onAsk()} disabled={asking}>
            <Play size={16} />
            {asking ? "Running" : "Ask"}
          </button>
        </div>
        <div className="prompt-grid">
          {(meta.sampleQuestions || []).map((prompt) => (
            <button key={prompt} onClick={() => onAsk(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </section>

      <div className="result-grid">
        <article className="panel answer-panel">
          <div className="panel-heading">
            <AlertTriangle size={18} />
            <h2>{asking ? "Analyzing graph" : answer?.title || "Graph insight"}</h2>
          </div>
          <p className="answer-text">
            {asking ? "Traversing the knowledge graph and agent memory." : answer?.answer || "Ask a question to query the graph."}
          </p>
          <div className="evidence-list">
            {(answer?.evidence || []).map((item, i) => (
              <div className="evidence-item" key={i}>
                <CheckCircle2 size={16} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel cypher-panel">
          <div className="panel-heading">
            <Code2 size={18} />
            <h2>Generated Cypher</h2>
          </div>
          <pre>{answer?.cypher || "// Ask a question to generate Cypher"}</pre>
        </article>
      </div>
    </section>
  );
}

function MemoryTab({ memory, meta }) {
  return (
    <section className="memory-grid">
      {(memory.categories || []).map((category) => (
        <MemoryColumn title={category.title} icon={<BookOpen size={16} />} key={category.id}>
          {category.items.map((item) => (
            <div className="memory-card" key={item.id}>
              <strong>{item.title}</strong>
              {item.detail && <p>{item.detail}</p>}
              {item.tag && <span className="tag">{item.tag}</span>}
            </div>
          ))}
        </MemoryColumn>
      ))}
      <MemoryColumn title="Recent Assessments" icon={<Save size={16} />}>
        {(memory.assessments || []).length === 0 && <p className="hint">No assessments committed yet.</p>}
        {(memory.assessments || []).map((a, i) => (
          <div className="memory-card" key={i}>
            <strong>{a.entityId} · {a.level} ({a.score})</strong>
            <p>{a.summary}</p>
            <span className="tag">{a.recordedAt ? new Date(a.recordedAt).toLocaleString() : ""}</span>
          </div>
        ))}
      </MemoryColumn>
    </section>
  );
}

function MemoryColumn({ title, icon, children }) {
  return (
    <div className="panel memory-column">
      <div className="panel-heading">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="memory-list">{children}</div>
    </div>
  );
}

const GROUP_COLUMNS = ["pr", "file", "module", "service", "team", "pattern", "incident", "decision", "lesson"];

function GraphCanvas({ graph, selectedId, brand }) {
  const positioned = useMemo(() => positionGraph(graph), [graph]);
  if (positioned.nodes.length === 0) {
    return <div className="graph-canvas empty">No graph data.</div>;
  }
  return (
    <div className="graph-canvas">
      <svg viewBox="0 0 1100 520" role="img" aria-label={`${brand} evidence graph`}>
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
          </marker>
        </defs>
        {positioned.links.map((link, i) => {
          const source = positioned.nodeMap.get(link.source);
          const target = positioned.nodeMap.get(link.target);
          if (!source || !target) return null;
          return (
            <g key={i}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={`edge ${link.type.toLowerCase()}`}
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}
        {positioned.nodes.map((node) => (
          <g
            key={node.id}
            className={`graph-node ${node.group} ${node.id === selectedId ? "selected" : ""} ${node.sensitive ? "sensitive" : ""}`}
            transform={`translate(${node.x}, ${node.y})`}
          >
            <circle r={node.group === "pr" ? 30 : 24} />
            <text y="-2">{truncate(node.label, 14)}</text>
            <text y="12" className="node-type">{node.group}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function GraphLegend() {
  return (
    <div className="legend">
      {GROUP_COLUMNS.map((group) => (
        <span className="legend-item" key={group}>
          <i className={`dot ${group}`} />
          {group}
        </span>
      ))}
    </div>
  );
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function positionGraph(graph) {
  const presentGroups = GROUP_COLUMNS.filter((group) => graph.nodes.some((node) => node.group === group));
  const columnWidth = 1100 / (presentGroups.length + 1);
  const counts = {};
  const seen = {};

  for (const node of graph.nodes) counts[node.group] = (counts[node.group] || 0) + 1;

  const nodes = graph.nodes.map((node) => {
    seen[node.group] = (seen[node.group] || 0) + 1;
    const columnIndex = presentGroups.indexOf(node.group);
    const total = counts[node.group];
    const spacing = 440 / Math.max(total, 1);
    return {
      ...node,
      x: columnWidth * (columnIndex + 1),
      y: total === 1 ? 260 : 60 + (seen[node.group] - 1) * spacing + spacing / 2
    };
  });

  return { nodes, links: graph.links, nodeMap: new Map(nodes.map((n) => [n.id, n])) };
}

createRoot(document.getElementById("root")).render(<App />);
