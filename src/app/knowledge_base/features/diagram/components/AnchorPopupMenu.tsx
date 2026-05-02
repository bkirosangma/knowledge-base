import { useState, useEffect, useRef } from "react";
import { Box, Diamond, Boxes, Search } from "lucide-react";
import type { NodeData } from "../types";
import { getDistinctTypes } from "../utils/typeUtils";

const BRANCH_LEN = 44;
const CENTER_R = 10;
const OPTION_R = 16;

interface BranchDef {
  key: string;
  angle: number;
  icon: typeof Box;
  color: string;
  hoverColor: string;
}

export default function AnchorPopupMenu({
  x,
  y,
  sourceNodeId,
  nodes,
  onClose,
  onConnectToElement,
  onCreateCondition,
  onConnectToType,
  anchorEdge,
  onMenuEnter,
  onMenuLeave,
}: {
  x: number;
  y: number;
  sourceNodeId: string;
  nodes: NodeData[];
  onClose: () => void;
  onConnectToElement: (targetNodeId: string) => void;
  onCreateCondition: () => void;
  onConnectToType: (type: string) => void;
  anchorEdge?: "top" | "right" | "bottom" | "left";
  onMenuEnter?: () => void;
  onMenuLeave?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subPanel, setSubPanel] = useState<"element" | "type" | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);

  const otherNodes = nodes.filter((n) => n.id !== sourceNodeId && n.shape !== "condition");
  const types = getDistinctTypes(nodes);
  const hasTypes = types.length > 0;

  const filteredNodes = search
    ? otherNodes.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()) || n.id.toLowerCase().includes(search.toLowerCase()))
    : otherNodes;

  const filteredTypes = search
    ? types.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : types;

  useEffect(() => {
    if (subPanel && searchRef.current) searchRef.current.focus();
  }, [subPanel]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (subPanel) {
          setSubPanel(null);
          setSearch("");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, subPanel]);

  // Branch definitions — angles are perpendicular to the anchor's edge
  const baseAngle = anchorEdge === "top" ? -90 : anchorEdge === "bottom" ? 90 : anchorEdge === "left" ? 180 : 0;
  const branchDefs: Omit<BranchDef, "angle">[] = [
    { key: "element", icon: Box, color: "#64748b", hoverColor: "#3b82f6" },
    { key: "condition", icon: Diamond, color: "#64748b", hoverColor: "#f59e0b" },
  ];
  if (hasTypes) {
    branchDefs.push({ key: "type", icon: Boxes, color: "#64748b", hoverColor: "#8b5cf6" });
  }
  const spread = branchDefs.length === 2 ? 40 : 45;
  const branches: BranchDef[] = branchDefs.map((b, i) => {
    const offset = branchDefs.length === 1 ? 0 : (i - (branchDefs.length - 1) / 2) * spread;
    return { ...b, angle: baseAngle + offset };
  });

  // Compute branch endpoint positions
  const branchEndpoints = branches.map((b) => {
    const rad = (b.angle * Math.PI) / 180;
    return {
      ...b,
      ex: Math.cos(rad) * BRANCH_LEN,
      ey: Math.sin(rad) * BRANCH_LEN,
    };
  });

  // No flip needed — perpendicular direction naturally points away from node

  // SVG viewbox needs to encompass center + all branch endpoints + option circles
  const padding = OPTION_R + 4;
  const svgSize = (BRANCH_LEN + OPTION_R + padding) * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const handleBranchClick = (key: string) => {
    if (key === "element") {
      setSubPanel("element");
      setSearch("");
    } else if (key === "condition") {
      onCreateCondition();
      onClose();
    } else if (key === "type") {
      setSubPanel("type");
      setSearch("");
    }
  };

  // Sub-panel position relative to the anchor
  const subPanelStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x + 30, window.innerWidth - 228),
    top: Math.min(y - 10, window.innerHeight - 308),
    zIndex: 10000,
  };

  const btnClass = "flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] transition-colors text-ink-2 hover:bg-surface-2";

  return (
    <div ref={menuRef} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
      {/* Radial menu */}
      {!subPanel && (
        <div
          className="fixed z-[9999]"
          style={{
            left: x - cx,
            top: y - cy,
            width: svgSize,
            height: svgSize,
            pointerEvents: "none",
          }}
        >
          <svg
            width={svgSize}
            height={svgSize}
            style={{ pointerEvents: "none" }}
          >
            {/* Branch lines */}
            {branchEndpoints.map((b) => (
              <line
                key={`line-${b.key}`}
                x1={cx}
                y1={cy}
                x2={cx + b.ex}
                y2={cy + b.ey}
                stroke={hoveredBranch === b.key ? b.hoverColor : "#cbd5e1"}
                strokeWidth={1.5}
                style={{ transition: "stroke 150ms" }}
              />
            ))}

            {/* Center circle */}
            <circle
              cx={cx}
              cy={cy}
              r={CENTER_R}
              fill="white"
              stroke="#cbd5e1"
              strokeWidth={1.5}
            />
            <circle
              cx={cx}
              cy={cy}
              r={3}
              fill="#94a3b8"
            />

            {/* Option circles */}
            {branchEndpoints.map((b) => {
              const isHovered = hoveredBranch === b.key;
              const IconComp = b.icon;
              return (
                <g key={`opt-${b.key}`}>
                  <circle
                    cx={cx + b.ex}
                    cy={cy + b.ey}
                    r={OPTION_R}
                    fill={isHovered ? "#f8fafc" : "white"}
                    stroke={isHovered ? b.hoverColor : "#e2e8f0"}
                    strokeWidth={isHovered ? 2 : 1.5}
                    style={{ cursor: "pointer", pointerEvents: "auto", transition: "all 150ms" }}
                    onMouseEnter={() => setHoveredBranch(b.key)}
                    onMouseLeave={() => setHoveredBranch(null)}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                    onClick={() => handleBranchClick(b.key)}
                  />
                  <foreignObject
                    x={cx + b.ex - 8}
                    y={cy + b.ey - 8}
                    width={16}
                    height={16}
                    style={{ pointerEvents: "none" }}
                  >
                    <div className="flex items-center justify-center w-full h-full">
                      <IconComp size={13} strokeWidth={1.8} style={{ color: isHovered ? b.hoverColor : b.color }} />
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Sub-panel for element or type search */}
      {subPanel === "element" && (
        <div className="fixed z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 w-[220px] max-h-[300px] flex flex-col" style={subPanelStyle}>
          <div className="px-2 py-1.5 border-b border-line">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-line rounded px-2 py-1">
              <Search size={12} className="text-mute shrink-0" />
              <input
                ref={searchRef}
                className="text-[12px] bg-transparent outline-none w-full text-ink-2 placeholder:text-mute"
                placeholder="Search elements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredNodes.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-mute">No elements found</div>
            )}
            {filteredNodes.map((n) => (
              <button
                key={n.id}
                className={btnClass}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { onConnectToElement(n.id); onClose(); }}
              >
                <Box size={12} className="text-mute shrink-0" />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {subPanel === "type" && (
        <div className="fixed z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 w-[220px] max-h-[300px] flex flex-col" style={subPanelStyle}>
          <div className="px-2 py-1.5 border-b border-line">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-line rounded px-2 py-1">
              <Search size={12} className="text-mute shrink-0" />
              <input
                ref={searchRef}
                className="text-[12px] bg-transparent outline-none w-full text-ink-2 placeholder:text-mute"
                placeholder="Search types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredTypes.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-mute">No types defined</div>
            )}
            {filteredTypes.map((t) => (
              <button
                key={t}
                className={btnClass}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { onConnectToType(t); onClose(); }}
              >
                <Boxes size={12} className="text-mute shrink-0" />
                <span className="truncate">{t}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
