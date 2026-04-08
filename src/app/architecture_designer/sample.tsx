import React, { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Monitor,
  Network,
  Database,
  Archive,
  Cloud,
  Settings,
} from "lucide-react";
import Layer from "./components/Layer";
import Element from "./components/Element";
import DataLine from "./components/DataLine";
import {
  type AnchorId,
  getAnchorPosition,
  getAnchors,
  findNearestAnchor,
} from "./utils/anchors";
import { computeOrthogonalPath, buildObstacles } from "./utils/orthogonalRouter";

interface NodeData {
  id: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  x: number;
  y: number;
  w: number;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  fromAnchor: AnchorId;
  toAnchor: AnchorId;
  color: string;
  label: string;
}

const initialNodes: NodeData[] = [
  { id: "grafana", label: "Grafana Dashboards", icon: Monitor, x: 640, y: 85, w: 210 },
  { id: "querier", label: "Thanos Querier", sub: "Deduplication & Stream Merging", icon: Network, x: 640, y: 220, w: 210 },
  { id: "store", label: "Thanos Store Gateway (HA Pair)", icon: Database, x: 390, y: 300, w: 210 },
  { id: "compactor", label: "Thanos Compactor", sub: "Retention Enforcement & Downsampling", icon: Archive, x: 890, y: 300, w: 210 },
  { id: "s3", label: "S3: metrics-lake bucket", icon: Cloud, x: 640, y: 470, w: 210 },
  { id: "sidecar1eu", label: "Thanos Sidecar", icon: Database, x: 260, y: 650, w: 130 },
  { id: "pv1eu", label: "TSDB Volume", icon: Archive, x: 120, y: 650, w: 110 },
  { id: "prom1eu", label: "Prometheus 1-eu (Rep A)", icon: Database, x: 190, y: 750, w: 190 },
  { id: "sidecar2eu", label: "Thanos Sidecar", icon: Database, x: 540, y: 650, w: 130 },
  { id: "pv2eu", label: "TSDB Volume", icon: Archive, x: 400, y: 650, w: 110 },
  { id: "prom2eu", label: "Prometheus 2-eu (Rep B)", icon: Database, x: 470, y: 750, w: 190 },
  { id: "sidecar1us", label: "Thanos Sidecar", icon: Database, x: 880, y: 650, w: 130 },
  { id: "pv1us", label: "TSDB Volume", icon: Archive, x: 740, y: 650, w: 110 },
  { id: "prom1us", label: "Prometheus 1-us (Rep A)", icon: Database, x: 810, y: 750, w: 190 },
  { id: "sidecar2us", label: "Thanos Sidecar", icon: Database, x: 1160, y: 650, w: 130 },
  { id: "pv2us", label: "TSDB Volume", icon: Archive, x: 1020, y: 650, w: 110 },
  { id: "prom2us", label: "Prometheus 2-us (Rep B)", icon: Database, x: 1090, y: 750, w: 190 },
  { id: "appeu", label: "Spring Boot Microservices (EU)", icon: Settings, x: 330, y: 860, w: 230 },
  { id: "appus", label: "Spring Boot Microservices (US)", icon: Settings, x: 950, y: 860, w: 230 },
];

const initialConnections: Connection[] = [
  { id: "l-g-q", from: "grafana", to: "querier", fromAnchor: "bottom-1", toAnchor: "top-1", color: "#3b82f6", label: "HTTP PromQL Query" },
  { id: "l-q-s", from: "querier", to: "store", fromAnchor: "bottom-0", toAnchor: "top-1", color: "#3b82f6", label: "gRPC Store API (Historical)" },
  { id: "l-q-s3", from: "querier", to: "s3", fromAnchor: "bottom-1", toAnchor: "top-1", color: "#3b82f6", label: "Direct S3 Read" },
  { id: "l-st-s3", from: "store", to: "s3", fromAnchor: "bottom-1", toAnchor: "top-0", color: "#3b82f6", label: "Index & Serve Blocks" },
  { id: "l-c-s3-1", from: "compactor", to: "s3", fromAnchor: "bottom-0", toAnchor: "top-2", color: "#3b82f6", label: "Compaction: Block Merging" },
  { id: "l-c-s3-2", from: "compactor", to: "s3", fromAnchor: "bottom-1", toAnchor: "top-right", color: "#3b82f6", label: "Downsampling: 5m and 1h resolutions" },
  { id: "l-c-s3-3", from: "compactor", to: "s3", fromAnchor: "bottom-2", toAnchor: "right-0", color: "#3b82f6", label: "Enforce Retention Policies" },
  { id: "l-q-s1e", from: "querier", to: "sidecar1eu", fromAnchor: "bottom-left", toAnchor: "top-1", color: "#3b82f6", label: "gRPC Store API (Real-time)" },
  { id: "l-q-s2e", from: "querier", to: "sidecar2eu", fromAnchor: "left-2", toAnchor: "top-1", color: "#3b82f6", label: "gRPC Store API (Real-time)" },
  { id: "l-q-s1u", from: "querier", to: "sidecar1us", fromAnchor: "right-2", toAnchor: "top-1", color: "#3b82f6", label: "gRPC Store API (Real-time)" },
  { id: "l-q-s2u", from: "querier", to: "sidecar2us", fromAnchor: "bottom-right", toAnchor: "top-1", color: "#3b82f6", label: "gRPC Store API (Real-time)" },
  { id: "l-s3-s1e", from: "sidecar1eu", to: "s3", fromAnchor: "top-1", toAnchor: "bottom-left", color: "#10b981", label: "Upload Blocks (S3 API)" },
  { id: "l-s3-s2e", from: "sidecar2eu", to: "s3", fromAnchor: "top-1", toAnchor: "bottom-0", color: "#10b981", label: "Upload Blocks (S3 API)" },
  { id: "l-s3-s1u", from: "sidecar1us", to: "s3", fromAnchor: "top-1", toAnchor: "bottom-2", color: "#10b981", label: "Upload Blocks (S3 API)" },
  { id: "l-s3-s2u", from: "sidecar2us", to: "s3", fromAnchor: "top-1", toAnchor: "bottom-right", color: "#10b981", label: "Upload Blocks (S3 API)" },
  { id: "l-p1-s1e", from: "prom1eu", to: "sidecar1eu", fromAnchor: "top-2", toAnchor: "bottom-1", color: "#64748b", label: "Read TSDB API" },
  { id: "l-p2-s2e", from: "prom2eu", to: "sidecar2eu", fromAnchor: "top-2", toAnchor: "bottom-1", color: "#64748b", label: "Read TSDB API" },
  { id: "l-p1-s1u", from: "prom1us", to: "sidecar1us", fromAnchor: "top-2", toAnchor: "bottom-1", color: "#64748b", label: "Read TSDB API" },
  { id: "l-p2-s2u", from: "prom2us", to: "sidecar2us", fromAnchor: "top-2", toAnchor: "bottom-1", color: "#64748b", label: "Read TSDB API" },
  { id: "l-p1-pv1e", from: "prom1eu", to: "pv1eu", fromAnchor: "top-0", toAnchor: "bottom-1", color: "#64748b", label: "Write TSDB Blocks" },
  { id: "l-p2-pv2e", from: "prom2eu", to: "pv2eu", fromAnchor: "top-0", toAnchor: "bottom-1", color: "#64748b", label: "Write TSDB Blocks" },
  { id: "l-p1-pv1u", from: "prom1us", to: "pv1us", fromAnchor: "top-0", toAnchor: "bottom-1", color: "#64748b", label: "Write TSDB Blocks" },
  { id: "l-p2-pv2u", from: "prom2us", to: "pv2us", fromAnchor: "top-0", toAnchor: "bottom-1", color: "#64748b", label: "Write TSDB Blocks" },
  { id: "l-ae-p1", from: "appeu", to: "prom1eu", fromAnchor: "top-0", toAnchor: "bottom-0", color: "#3b82f6", label: "HTTP Scrape" },
  { id: "l-ae-p2", from: "appeu", to: "prom2eu", fromAnchor: "top-2", toAnchor: "bottom-2", color: "#3b82f6", label: "HTTP Scrape" },
  { id: "l-au-p1", from: "appus", to: "prom1us", fromAnchor: "top-0", toAnchor: "bottom-0", color: "#3b82f6", label: "HTTP Scrape" },
  { id: "l-au-p2", from: "appus", to: "prom2us", fromAnchor: "top-2", toAnchor: "bottom-2", color: "#3b82f6", label: "HTTP Scrape" },
];

function getNodeHeight(w: number): number {
  return w === 110 || w === 130 ? 60 : 70;
}

export default function ThanosArchitecture() {
  const [isLive, setIsLive] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [hoveredLine, setHoveredLine] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [nodes, setNodes] = useState(initialNodes);
  const [connections, setConnections] = useState(initialConnections);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState<{
    connectionId: string;
    end: "from" | "to";
    currentPos: { x: number; y: number };
    snappedAnchor: {
      nodeId: string;
      anchorId: AnchorId;
      x: number;
      y: number;
    } | null;
    originalNodeId: string;
    originalAnchor: AnchorId;
  } | null>(null);
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, { w: number; h: number }>>({});

  const handleElementResize = useCallback((id: string, width: number, height: number) => {
    setMeasuredSizes((prev) => {
      const existing = prev[id];
      if (existing && existing.w === width && existing.h === height) return prev;
      return { ...prev, [id]: { w: width, h: height } };
    });
  }, []);

  const getNodeDimensions = useCallback((node: NodeData) => {
    const measured = measuredSizes[node.id];
    return {
      w: measured?.w ?? node.w,
      h: measured?.h ?? getNodeHeight(node.w),
    };
  }, [measuredSizes]);

  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // --- Node dragging ---
  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    if (draggingEndpoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;

    dragOffset.current = {
      x: e.clientX - rect.left - node.x + canvas.scrollLeft,
      y: e.clientY - rect.top - node.y + canvas.scrollTop,
    };
    setDraggingId(id);
  }, [nodes, draggingEndpoint]);

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newX = e.clientX - rect.left - dragOffset.current.x + canvas.scrollLeft;
      const newY = e.clientY - rect.top - dragOffset.current.y + canvas.scrollTop;

      setNodes((prev) =>
        prev.map((n) => (n.id === draggingId ? { ...n, x: newX, y: newY } : n))
      );
    };

    const handleMouseUp = () => setDraggingId(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingId]);

  // --- Line click → drag nearest endpoint ---
  const handleLineClick = useCallback(
    (connectionId: string, e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left + canvas.scrollLeft;
      const my = e.clientY - rect.top + canvas.scrollTop;

      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;

      const fromNode = nodes.find((n) => n.id === conn.from);
      const toNode = nodes.find((n) => n.id === conn.to);
      if (!fromNode || !toNode) return;

      const fromDims = getNodeDimensions(fromNode);
      const toDims = getNodeDimensions(toNode);
      const fromPos = getAnchorPosition(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h);
      const toPos = getAnchorPosition(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h);

      const distFrom = Math.hypot(mx - fromPos.x, my - fromPos.y);
      const distTo = Math.hypot(mx - toPos.x, my - toPos.y);

      const end = distFrom <= distTo ? "from" : "to";
      const originalNodeId = end === "from" ? conn.from : conn.to;
      const originalAnchor = end === "from" ? conn.fromAnchor : conn.toAnchor;

      setDraggingEndpoint({
        connectionId,
        end,
        currentPos: { x: mx, y: my },
        snappedAnchor: null,
        originalNodeId,
        originalAnchor,
      });
    },
    [connections, nodes, getNodeDimensions]
  );

  useEffect(() => {
    if (!draggingEndpoint) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left + canvas.scrollLeft;
      const my = e.clientY - rect.top + canvas.scrollTop;

      const nodesWithHeight = nodes.map((n) => {
        const dims = getNodeDimensions(n);
        return { id: n.id, x: n.x, y: n.y, w: dims.w, h: dims.h };
      });

      const nearest = findNearestAnchor(mx, my, nodesWithHeight, 25);

      setDraggingEndpoint((prev) =>
        prev
          ? {
              ...prev,
              currentPos: { x: mx, y: my },
              snappedAnchor: nearest
                ? {
                    nodeId: nearest.nodeId,
                    anchorId: nearest.anchorId,
                    x: nearest.x,
                    y: nearest.y,
                  }
                : null,
            }
          : null
      );
    };

    const handleMouseUp = () => {
      setDraggingEndpoint((prev) => {
        if (!prev) return null;

        const target = prev.snappedAnchor ?? {
          nodeId: prev.originalNodeId,
          anchorId: prev.originalAnchor,
        };

        setConnections((conns) =>
          conns.map((c) => {
            if (c.id !== prev.connectionId) return c;
            if (prev.end === "from") {
              return { ...c, from: target.nodeId, fromAnchor: target.anchorId };
            } else {
              return { ...c, to: target.nodeId, toAnchor: target.anchorId };
            }
          })
        );

        return null;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingEndpoint, nodes, getNodeDimensions]);

  // --- Compute lines from connections + node positions ---
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // Build node dimensions list for obstacle computation
  const allNodeRects = nodes.map((n) => {
    const dims = getNodeDimensions(n);
    return { id: n.id, x: n.x, y: n.y, w: dims.w, h: dims.h };
  });

  const lines = connections.map((conn) => {
    const fromNode = nodeMap[conn.from];
    const toNode = nodeMap[conn.to];
    const fromDims = getNodeDimensions(fromNode);
    const toDims = getNodeDimensions(toNode);

    const fromPos = getAnchorPosition(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h);
    const toPos = getAnchorPosition(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h);

    const obstacles = buildObstacles(allNodeRects, [conn.from, conn.to]);

    return {
      id: conn.id,
      path: computeOrthogonalPath(fromPos, toPos, conn.fromAnchor, conn.toAnchor, obstacles),
      color: conn.color,
      label: conn.label,
      fromPos,
      toPos,
    };
  });

  // Ghost line: straight line from the fixed endpoint to the cursor/snap point
  let ghostLine: { path: string; color: string; fromPos: { x: number; y: number }; toPos: { x: number; y: number } } | null = null;
  if (draggingEndpoint) {
    const conn = connections.find((c) => c.id === draggingEndpoint.connectionId);
    if (conn) {
      const fromNode = nodeMap[conn.from];
      const toNode = nodeMap[conn.to];
      const fromDims = getNodeDimensions(fromNode);
      const toDims = getNodeDimensions(toNode);

      const fixedPos = draggingEndpoint.end === "from"
        ? getAnchorPosition(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h)
        : getAnchorPosition(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h);

      const dragPos = draggingEndpoint.snappedAnchor
        ? { x: draggingEndpoint.snappedAnchor.x, y: draggingEndpoint.snappedAnchor.y }
        : draggingEndpoint.currentPos;

      const gFrom = draggingEndpoint.end === "from" ? dragPos : fixedPos;
      const gTo = draggingEndpoint.end === "from" ? fixedPos : dragPos;

      ghostLine = {
        path: `M ${gFrom.x} ${gFrom.y} L ${gTo.x} ${gTo.y}`,
        color: conn.color,
        fromPos: gFrom,
        toPos: gTo,
      };
    }
  }

  const regions = [
    { id: "l1", title: "USER VISUALIZATION & QUERY ENTRY", top: 20, height: 110, bg: "bg-[#eff3f9]", border: "border-[#cdd6e4]" },
    { id: "l2", title: "THANOS GLOBAL QUERY & CONTROL (CENTRAL)", top: 150, height: 210, bg: "bg-[#eff3f9]", border: "border-[#cdd6e4]" },
    { id: "l3", title: "OBJECT STORAGE METRIC LAKE", top: 380, height: 180, bg: "bg-[#eff3f9]", border: "border-[#cdd6e4]" },
    { id: "l4", title: "REGIONAL CLUSTERS LAYER", top: 580, height: 330, bg: "bg-[#e5ecec]", border: "border-[#cdd6e4]" },
  ];

  return (
    <div className="w-full min-h-screen bg-[#f4f7f9] p-4 md:p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-[1400px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden flex flex-col">
        {/* Top Header Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end px-8 pt-8 pb-6 bg-white border-b border-slate-100 gap-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-sm transition-colors">
              &larr; Back
            </Link>
            <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
              Thanos Production Architecture
            </h1>
          </div>
          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Regional Clusters</div>
              <div className="font-semibold text-slate-800">EU, US (HA)</div>
            </div>
            <div>
              <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Global Endpoint</div>
              <div className="font-semibold text-slate-800">Thanos Querier</div>
            </div>
            <div>
              <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Lake</div>
              <div className="font-semibold text-slate-800">S3 Metrics</div>
            </div>
            <div>
              <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Status</div>
              <div className="font-semibold flex items-center gap-2 text-slate-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 block shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                Production
              </div>
            </div>
          </div>
        </div>

        {/* Diagram Canvas Area */}
        <div className="w-full overflow-x-auto bg-[#f9fbff] p-4 relative">
          <div
            ref={canvasRef}
            className={`relative min-w-[1280px] h-[940px] mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden shadow-inner ${draggingId ? "cursor-grabbing" : ""}`}
          >
            {/* Background Region Layers */}
            {regions.map((r) => (
              <Layer key={r.id} {...r} />
            ))}

            {/* SVG Lines & Data Streams */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 5 }}
            >
              {lines.map((line) => {
                const isBeingDragged = draggingEndpoint?.connectionId === line.id;
                const dimmed = !!draggingEndpoint && !isBeingDragged;
                return (
                  <DataLine
                    key={line.id}
                    {...line}
                    isLive={isLive}
                    isHovered={hoveredLine?.id === line.id}
                    isDraggingEndpoint={isBeingDragged}
                    dimmed={dimmed}
                    onHoverStart={(id, label, x, y) => setHoveredLine({ id, label, x, y })}
                    onHoverMove={(id, x, y) =>
                      setHoveredLine((prev) => (prev?.id === id ? { ...prev, x, y } : prev))
                    }
                    onHoverEnd={() => setHoveredLine(null)}
                    onLineClick={handleLineClick}
                  />
                );
              })}
              {/* Ghost line while dragging an endpoint */}
              {ghostLine && (
                <g>
                  <line
                    x1={ghostLine.fromPos.x}
                    y1={ghostLine.fromPos.y}
                    x2={ghostLine.toPos.x}
                    y2={ghostLine.toPos.y}
                    stroke={ghostLine.color}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity="0.7"
                  />
                  <circle
                    cx={ghostLine.toPos.x}
                    cy={ghostLine.toPos.y}
                    r={draggingEndpoint?.snappedAnchor ? 6 : 5}
                    fill={draggingEndpoint?.snappedAnchor ? ghostLine.color : "white"}
                    stroke={ghostLine.color}
                    strokeWidth={2}
                  />
                  <circle
                    cx={ghostLine.fromPos.x}
                    cy={ghostLine.fromPos.y}
                    r={draggingEndpoint?.snappedAnchor ? 6 : 5}
                    fill={draggingEndpoint?.snappedAnchor ? ghostLine.color : "white"}
                    stroke={ghostLine.color}
                    strokeWidth={2}
                  />
                </g>
              )}
            </svg>

            {/* Render Nodes */}
            {nodes.map((node) => {
              const dims = getNodeDimensions(node);
              const anchors = getAnchors(node.x, node.y, dims.w, dims.h);
              const isSnapTarget = draggingEndpoint?.snappedAnchor?.nodeId === node.id;

              // During endpoint drag: the fixed-end node and the hovered node are active
              let dimmed = false;
              let showAnchors = hoveredNodeId === node.id;
              if (draggingEndpoint) {
                const dragConn = connections.find((c) => c.id === draggingEndpoint.connectionId);
                const fixedNodeId = dragConn
                  ? (draggingEndpoint.end === "from" ? dragConn.to : dragConn.from)
                  : null;
                const isFixedEnd = node.id === fixedNodeId;
                const isHoveredTarget = hoveredNodeId === node.id;
                dimmed = !isFixedEnd && !isHoveredTarget;
                showAnchors = isHoveredTarget;
              }

              return (
                <Element
                  key={node.id}
                  {...node}
                  showLabels={showLabels}
                  onDragStart={handleDragStart}
                  isDragging={draggingId === node.id}
                  showAnchors={showAnchors}
                  highlightedAnchor={isSnapTarget ? draggingEndpoint!.snappedAnchor!.anchorId : null}
                  anchors={anchors}
                  measuredHeight={dims.h}
                  onResize={handleElementResize}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  dimmed={dimmed}
                />
              );
            })}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredLine && (
          <div
            className="fixed z-50 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
            style={{ left: hoveredLine.x, top: hoveredLine.y - 15 }}
          >
            {hoveredLine.label}
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="bg-[#f0f4f8] p-5 flex flex-col sm:flex-row items-center justify-between mx-6 my-6 rounded-xl border border-slate-200">
          <div className="flex items-center gap-8 mb-4 sm:mb-0">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setIsLive(!isLive)}
            >
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                Live Data Flow
              </span>
              <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${isLive ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isLive ? "translate-x-5" : ""}`} />
              </div>
            </div>

            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setShowLabels(!showLabels)}
            >
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                Show Labels
              </span>
              <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${showLabels ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showLabels ? "translate-x-5" : ""}`} />
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setIsLive(true);
              setShowLabels(true);
              setNodes(initialNodes);
              setConnections(initialConnections);
            }}
            className="px-6 py-2 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-full text-sm transition-colors shadow-sm"
          >
            Reset View
          </button>
        </div>
      </div>
    </div>
  );
}
