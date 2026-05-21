import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Code2,
  GitPullRequest,
  Network,
  Play,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import "./styles.css";

const API_URL = "http://127.0.0.1:4000";

const promptButtons = [
  "Why is this PR risky?",
  "Show modules most affected by AI-generated changes.",
  "Which services are becoming tightly coupled?",
  "Is this PR similar to a known anti-pattern?"
];

const fallbackPrs = [
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
  }
];

const fallbackGraph = {
  nodes: [
    { id: "PR-184", label: "PR", group: "pr", risk: 88 },
    { id: "AuthService", label: "AuthService", group: "service" },
    { id: "UserService", label: "UserService", group: "service" },
    { id: "TokenService", label: "TokenService", group: "service" },
    { id: "DuplicateValidationLogic", label: "Duplicate validation", group: "smell" },
    { id: "ScatteredAuthPolicy", label: "Scattered auth policy", group: "antipattern" },
    { id: "AI-Auth-Block", label: "AI generated auth block", group: "ai" }
  ],
  links: [
    { source: "PR-184", target: "AuthService", type: "MODIFIES" },
    { source: "AuthService", target: "TokenService", type: "DEPENDS_ON" },
    { source: "TokenService", target: "UserService", type: "DEPENDS_ON" },
    { source: "UserService", target: "AuthService", type: "DEPENDS_ON" },
    { source: "AI-Auth-Block", target: "ScatteredAuthPolicy", type: "SIMILAR_TO" },
    { source: "ScatteredAuthPolicy", target: "DuplicateValidationLogic", type: "CAUSES" }
  ]
};

function App() {
  const [prs, setPrs] = useState(fallbackPrs);
  const [graph, setGraph] = useState(fallbackGraph);
  const [status, setStatus] = useState({ neo4j: "checking" });
  const [selectedPrId, setSelectedPrId] = useState("PR-184");
  const [question, setQuestion] = useState(promptButtons[0]);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  const selectedPr = useMemo(
    () => prs.find((pr) => pr.id === selectedPrId) || prs[0],
    [prs, selectedPrId]
  );

  useEffect(() => {
    async function load() {
      const [healthResponse, prsResponse, graphResponse] = await Promise.allSettled([
        fetch(`${API_URL}/api/health`),
        fetch(`${API_URL}/api/prs`),
        fetch(`${API_URL}/api/graph`)
      ]);

      if (healthResponse.status === "fulfilled") {
        setStatus(await healthResponse.value.json());
      }

      if (prsResponse.status === "fulfilled") {
        setPrs(await prsResponse.value.json());
      }

      if (graphResponse.status === "fulfilled") {
        setGraph(await graphResponse.value.json());
      }
    }

    load();
  }, []);

  useEffect(() => {
    askQuestion(promptButtons[0]);
  }, [selectedPrId]);

  async function askQuestion(nextQuestion = question) {
    setQuestion(nextQuestion);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, prId: selectedPrId })
      });

      setAnswer(await response.json());
    } catch {
      setAnswer({
        title: "Why this PR is risky",
        answer:
          "PR-184 is high risk because it touches authentication code, duplicates token validation, and creates a dependency cycle across identity services.",
        evidence: [
          "AuthService -> TokenService -> UserService -> AuthService",
          "AI generated auth block is similar to ScatteredAuthPolicy",
          "Security-sensitive files are modified"
        ],
        cypher: "MATCH path=(a:Service)-[:DEPENDS_ON*1..3]->(a) RETURN path",
        type: "risk"
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <Header status={status} />

      <section className="workspace">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-heading">
              <GitPullRequest size={18} />
              <h2>Pull Requests</h2>
            </div>
            <div className="pr-list">
              {prs.map((pr) => (
                <button
                  className={`pr-row ${pr.id === selectedPrId ? "active" : ""}`}
                  key={pr.id}
                  onClick={() => setSelectedPrId(pr.id)}
                >
                  <span>
                    <strong>{pr.id}</strong>
                    <small>{pr.title}</small>
                  </span>
                  <RiskPill risk={pr.risk} />
                </button>
              ))}
            </div>
          </div>

          <div className="panel compact">
            <div className="panel-heading">
              <ShieldAlert size={18} />
              <h2>Signals</h2>
            </div>
            <SignalList pr={selectedPr} />
          </div>
        </aside>

        <section className="main-column">
          <section className="review-band">
            <div>
              <p className="eyebrow">AI Code Review Intelligence Agent</p>
              <h1>ReviewGraph AI</h1>
              <p className="intro">
                Ask architectural review questions and get Cypher-backed evidence
                from a codebase graph.
              </p>
            </div>
            <div className="score-tile">
              <span>Risk score</span>
              <strong>{selectedPr?.risk ?? 0}</strong>
              <small>{selectedPr?.aiGenerated ? "AI-assisted PR" : "Manual PR"}</small>
            </div>
          </section>

          <section className="query-panel">
            <div className="question-row">
              <BrainCircuit size={20} />
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    askQuestion();
                  }
                }}
                aria-label="Ask ReviewGraph AI"
              />
              <button className="run-button" onClick={() => askQuestion()} disabled={loading}>
                <Play size={16} />
                {loading ? "Running" : "Ask"}
              </button>
            </div>

            <div className="prompt-grid">
              {promptButtons.map((prompt) => (
                <button key={prompt} onClick={() => askQuestion(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="result-grid">
            <AnswerPanel answer={answer} loading={loading} />
            <CypherPanel answer={answer} />
          </section>

          <section className="graph-section">
            <div className="section-heading">
              <Network size={19} />
              <h2>Graph Evidence</h2>
            </div>
            <GraphCanvas graph={graph} selectedPrId={selectedPrId} />
          </section>
        </section>
      </section>
    </main>
  );
}

function Header({ status }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>ReviewGraph AI</strong>
          <span>Neo4j-powered PR intelligence</span>
        </div>
      </div>
      <div className={`db-status ${status.neo4j === "connected" ? "connected" : "fallback"}`}>
        {status.neo4j === "connected" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
        Neo4j {status.neo4j}
      </div>
    </header>
  );
}

function RiskPill({ risk }) {
  const level = risk > 75 ? "high" : risk > 45 ? "medium" : "low";
  return <em className={`risk-pill ${level}`}>{risk}</em>;
}

function SignalList({ pr }) {
  if (!pr) {
    return null;
  }

  return (
    <div className="signals">
      <Signal label="Author" value={pr.author} />
      <Signal label="AI generated" value={pr.aiGenerated ? "Yes" : "No"} />
      <Signal label="Files touched" value={pr.files.length} />
      <Signal label="Code smells" value={pr.smells.length} />
      <Signal label="Anti-patterns" value={pr.antiPatterns.length || "None"} />
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

function AnswerPanel({ answer, loading }) {
  return (
    <article className="panel answer-panel">
      <div className="panel-heading">
        <AlertTriangle size={18} />
        <h2>{loading ? "Analyzing graph" : answer?.title || "Review insight"}</h2>
      </div>
      <p className="answer-text">
        {loading
          ? "Traversing modified files, service dependencies, smells, and similar anti-patterns."
          : answer?.answer}
      </p>
      <div className="evidence-list">
        {(answer?.evidence || []).map((item) => (
          <div className="evidence-item" key={item}>
            <CheckCircle2 size={16} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function CypherPanel({ answer }) {
  return (
    <article className="panel cypher-panel">
      <div className="panel-heading">
        <Code2 size={18} />
        <h2>Generated Cypher</h2>
      </div>
      <pre>{answer?.cypher || "MATCH (pr:PR)-[:MODIFIES]->(file:File) RETURN pr, file"}</pre>
    </article>
  );
}

function GraphCanvas({ graph, selectedPrId }) {
  const positioned = useMemo(() => positionGraph(graph), [graph]);

  return (
    <div className="graph-canvas">
      <svg viewBox="0 0 980 460" role="img" aria-label="ReviewGraph AI evidence graph">
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="#718096" />
          </marker>
        </defs>
        {positioned.links.map((link) => {
          const source = positioned.nodeMap.get(link.source);
          const target = positioned.nodeMap.get(link.target);

          if (!source || !target) {
            return null;
          }

          return (
            <g key={`${link.source}-${link.target}-${link.type}`}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={`edge ${link.type.toLowerCase()}`}
                markerEnd="url(#arrow)"
              />
              <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6}>
                {link.type}
              </text>
            </g>
          );
        })}
        {positioned.nodes.map((node) => (
          <g
            key={node.id}
            className={`graph-node ${node.group} ${node.id === selectedPrId ? "selected" : ""}`}
            transform={`translate(${node.x}, ${node.y})`}
          >
            <circle r={node.group === "pr" ? 38 : 31} />
            <text y="-3">{node.label}</text>
            <text y="13" className="node-type">
              {node.group}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function positionGraph(graph) {
  const rings = {
    pr: 90,
    ai: 220,
    service: 395,
    module: 535,
    smell: 700,
    antipattern: 840
  };

  const counts = graph.nodes.reduce((acc, node) => {
    acc[node.group] = (acc[node.group] || 0) + 1;
    return acc;
  }, {});

  const seen = {};
  const nodes = graph.nodes.map((node) => {
    seen[node.group] = (seen[node.group] || 0) + 1;
    const index = seen[node.group] - 1;
    const total = counts[node.group];
    const spacing = 320 / Math.max(total - 1, 1);

    return {
      ...node,
      x: rings[node.group] || 500,
      y: total === 1 ? 230 : 70 + index * spacing
    };
  });

  return {
    nodes,
    links: graph.links,
    nodeMap: new Map(nodes.map((node) => [node.id, node]))
  };
}

createRoot(document.getElementById("root")).render(<App />);
