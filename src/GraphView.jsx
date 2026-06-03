import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Move, Plus, RotateCcw } from "lucide-react";

const LAYER_ORDER = [
  "pr",
  "file",
  "module",
  "service",
  "team",
  "pattern",
  "decision",
  "adr",
  "incident",
  "lesson",
  "developer"
];

const LAYER_LABELS = {
  pr: "Change",
  file: "Files",
  module: "Modules",
  service: "Services",
  team: "Owners",
  pattern: "Risk patterns",
  decision: "Policies",
  adr: "ADRs",
  incident: "Incidents",
  lesson: "Lessons",
  developer: "Reviewers"
};

const NODE_R = { pr: 30, default: 24, small: 20 };
const LABEL_W = 118;
const LABEL_H = 40;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.5;
const ZOOM_FACTOR = 1.15;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function GraphMetricsBar({ metrics }) {
  if (!metrics) return null;
  const items = [
    { label: "Risk score", value: `${metrics.riskScore} · ${metrics.riskLevel}` },
    { label: "Graph nodes", value: metrics.nodes },
    { label: "Relationships", value: metrics.edges },
    { label: "Services touched", value: metrics.servicesTouched },
    { label: "Downstream blast", value: metrics.downstreamBlast },
    { label: "Security files", value: metrics.securityFiles },
    { label: "Policy violations", value: metrics.architectureViolations },
    { label: "Linked incidents", value: metrics.incidentsLinked },
    { label: "Evidence signals", value: metrics.evidenceItems }
  ];
  return (
    <div className="graph-metrics">
      {items.map((item) => (
        <div className="graph-metric" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function GraphLegend() {
  const groups = ["pr", "file", "module", "service", "team", "pattern", "incident", "decision", "lesson"];
  return (
    <div className="legend graph-legend-rich">
      {groups.map((group) => (
        <span className="legend-item" key={group}>
          <i className={`dot ${group}`} />
          {LAYER_LABELS[group] || group}
        </span>
      ))}
      <span className="legend-item">
        <i className="dot highlight" />
        Risk path
      </span>
    </div>
  );
}

export function GraphCanvas({ graph, selectedId, brand }) {
  const viewportRef = useRef(null);
  const [hoverId, setHoverId] = useState(null);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const positioned = useMemo(() => positionGraph(graph), [graph]);
  const highlightNodes = useMemo(
    () => new Set(graph?.highlights?.nodes || []),
    [graph?.highlights?.nodes]
  );
  const highlightLinks = useMemo(
    () => new Set(graph?.highlights?.links || []),
    [graph?.highlights?.links]
  );

  const fitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !positioned.width) return;
    const pad = 48;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const k = clamp(Math.min((vw - pad) / positioned.width, (vh - pad) / positioned.height), MIN_ZOOM, 1.2);
    setTransform({
      k,
      x: (vw - positioned.width * k) / 2,
      y: (vh - positioned.height * k) / 2
    });
  }, [positioned.width, positioned.height]);

  useEffect(() => {
    if (positioned.nodes.length > 0) fitView();
  }, [positioned.nodes.length, positioned.width, positioned.height, selectedId, fitView]);

  const zoomBy = useCallback((factor, center) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = center?.x ?? rect.width / 2;
    const my = center?.y ?? rect.height / 2;
    setTransform((t) => {
      const k2 = clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = k2 / t.k;
      return { k: k2, x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio };
    });
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest?.(".graph-node")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: transformRef.current.x,
      panY: transformRef.current.y
    };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const nextX = drag.panX + dx;
    const nextY = drag.panY + dy;
    setTransform((t) => ({ ...t, x: nextX, y: nextY }));
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* pointer already released */
    }
  };

  if (positioned.nodes.length === 0) {
    return <div className="graph-canvas empty">Select a pull request to explore graph evidence.</div>;
  }

  const { width, height } = positioned;
  const zoomPct = Math.round(transform.k * 100);

  return (
    <div className="graph-viewport-wrap">
      <div className="graph-toolbar" role="toolbar" aria-label="Graph zoom controls">
        <button type="button" className="graph-tool-btn" title="Zoom in" onClick={() => zoomBy(ZOOM_FACTOR)}>
          <Plus size={16} />
        </button>
        <button type="button" className="graph-tool-btn" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_FACTOR)}>
          <Minus size={16} />
        </button>
        <button type="button" className="graph-tool-btn" title="Fit graph to view" onClick={fitView}>
          <Maximize2 size={16} />
        </button>
        <button type="button" className="graph-tool-btn" title="Reset zoom" onClick={fitView}>
          <RotateCcw size={16} />
        </button>
        <span className="graph-zoom-label">{zoomPct}%</span>
      </div>

      <div
        ref={viewportRef}
        className={`graph-viewport ${dragging ? "dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitView}
      >
        <svg
          width="100%"
          height="100%"
          role="img"
          aria-label={`${brand} evidence graph`}
          className="graph-svg-pan"
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            <rect x={0} y={0} width={width} height={height} className="graph-bg-rect" />

            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
              </marker>
              <marker id="arrow-risk" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#dc2626" />
              </marker>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {positioned.columns.map((col) => (
              <g key={col.group}>
                <text x={col.x} y={32} className="column-label">
                  {LAYER_LABELS[col.group] || col.group}
                </text>
                <line x1={col.x} y1={48} x2={col.x} y2={height - 32} className="column-guide" />
              </g>
            ))}

            {positioned.links.map((link, linkIndex) => {
              const source = positioned.nodeMap.get(link.source);
              const target = positioned.nodeMap.get(link.target);
              if (!source || !target) return null;
              const isRisk = highlightLinks.has(link.key);
              const active =
                isRisk ||
                hoverId === link.source ||
                hoverId === link.target ||
                link.source === selectedId ||
                link.target === selectedId;
              const path = bezierPath(source, target);
              const edgeKey = link.key || `${link.source}|${link.target}|${link.type}|${linkIndex}`;
              return (
                <g key={edgeKey} className={`edge-group ${active ? "active" : ""} ${isRisk ? "risk" : ""}`}>
                  <path
                    d={path}
                    className={`edge-path ${link.type.toLowerCase()}`}
                    markerEnd={isRisk ? "url(#arrow-risk)" : "url(#arrow)"}
                  />
                  {active && (
                    <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} className="edge-label">
                      {formatEdgeType(link.type)}
                    </text>
                  )}
                </g>
              );
            })}

            {positioned.nodes.map((node) => {
              const r = NODE_R[node.group] || NODE_R.default;
              const labelTop = -(r + LABEL_H + 10);
              const isSelected = node.id === selectedId;
              const isRisk = highlightNodes.has(node.id);
              const isHover = hoverId === node.id;
              const displayLabel = node.label || node.id;
              return (
                <g
                  key={node.id}
                  className={`graph-node ${node.group} ${isSelected ? "selected" : ""} ${node.sensitive ? "sensitive" : ""} ${isRisk ? "risk-node" : ""} ${isHover ? "hover" : ""}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoverId(node.id)}
                  onMouseLeave={() => setHoverId(null)}
                  filter={isSelected || isRisk ? "url(#glow)" : undefined}
                >
                  <foreignObject
                    x={-LABEL_W / 2}
                    y={labelTop}
                    width={LABEL_W}
                    height={LABEL_H}
                    className="node-label-fo"
                  >
                    <div
                      xmlns="http://www.w3.org/1999/xhtml"
                      className="graph-node-label"
                      title={node.fullPath || displayLabel}
                    >
                      {displayLabel}
                    </div>
                  </foreignObject>
                  <circle r={r} cy={0} />
                  <text y={r + 20} className="node-type">
                    {LAYER_LABELS[node.group] || node.group}
                  </text>
                  {node.fullPath && <title>{node.fullPath}</title>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="graph-hint">
        <Move size={13} aria-hidden />
        Scroll to zoom · Drag empty space to pan · Double-click to fit · Toolbar for +/- zoom
      </p>
    </div>
  );
}

function formatEdgeType(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/_/g, " ");
}

function bezierPath(source, target) {
  const dx = target.x - source.x;
  const cx = source.x + dx * 0.45;
  return `M ${source.x} ${source.y} C ${cx} ${source.y}, ${cx} ${target.y}, ${target.x} ${target.y}`;
}

function positionGraph(graph) {
  const nodes = graph?.nodes || [];
  const links = graph?.links || [];
  const presentGroups = LAYER_ORDER.filter((g) => nodes.some((n) => n.group === g));
  const colCount = Math.max(presentGroups.length, 1);
  const width = Math.max(1100, colCount * 148 + 100);
  const height = Math.max(680, 520);
  const colWidth = width / (colCount + 1);
  const counts = {};
  const seen = {};
  const topPad = 88;
  const bottomPad = 72;

  for (const node of nodes) counts[node.group] = (counts[node.group] || 0) + 1;

  const positionedNodes = nodes.map((node) => {
    seen[node.group] = (seen[node.group] || 0) + 1;
    const columnIndex = presentGroups.indexOf(node.group);
    const total = counts[node.group];
    const usable = height - topPad - bottomPad;
    const spacing = usable / Math.max(total, 1);
    return {
      ...node,
      x: colWidth * (columnIndex + 1),
      y: total === 1 ? height / 2 : topPad + (seen[node.group] - 0.5) * spacing
    };
  });

  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
  const columns = presentGroups.map((group, i) => ({
    group,
    x: colWidth * (i + 1)
  }));

  return { nodes: positionedNodes, links, nodeMap, columns, width, height };
}
