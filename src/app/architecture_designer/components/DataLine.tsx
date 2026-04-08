interface DataLineProps {
  id: string;
  path: string;
  color: string;
  label: string;
  hideDot?: boolean;
  isLive: boolean;
  isHovered: boolean;
  onHoverStart: (id: string, label: string, x: number, y: number) => void;
  onHoverMove: (id: string, x: number, y: number) => void;
  onHoverEnd: () => void;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  onLineClick: (connectionId: string, e: React.MouseEvent) => void;
  isDraggingEndpoint?: boolean;
  dimmed?: boolean;
}

export default function DataLine({
  id,
  path,
  color,
  hideDot,
  isLive,
  isHovered,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  label,
  fromPos,
  toPos,
  onLineClick,
  isDraggingEndpoint,
  dimmed,
}: DataLineProps) {
  const dotFill =
    color === "#10b981"
      ? "#059669"
      : color === "#64748b"
        ? "#475569"
        : "#2563eb";

  return (
    <g
      style={{ pointerEvents: "auto", cursor: "pointer" }}
      onMouseEnter={(e) => onHoverStart(id, label, e.clientX, e.clientY)}
      onMouseMove={(e) => onHoverMove(id, e.clientX, e.clientY)}
      onMouseLeave={onHoverEnd}
      onMouseDown={(e) => {
        e.stopPropagation();
        onLineClick(id, e);
      }}
    >
      {/* Wide invisible hit area for hover + click */}
      <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
      {/* Visible line */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={isDraggingEndpoint ? "1.5" : isHovered ? "3" : "1.5"}
        className="transition-all"
        opacity={dimmed ? 0.1 : isDraggingEndpoint ? 0.25 : isHovered ? 1 : 0.7}
        strokeDasharray={isDraggingEndpoint ? "4 3" : "none"}
      />
      {/* Animated dot */}
      {isLive && !hideDot && !isDraggingEndpoint && !dimmed && (
        <circle
          r={isHovered ? "6" : "4"}
          fill={dotFill}
          className="transition-all"
        >
          <animateMotion dur="2.5s" repeatCount="indefinite">
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      )}
      {/* Visible endpoint dots (hidden during drag — ghost line shows its own) */}
      {!isDraggingEndpoint && (
        <>
          <circle
            cx={fromPos.x}
            cy={fromPos.y}
            r={isHovered ? 6 : 4}
            fill={isHovered ? color : "transparent"}
            stroke={isHovered ? "white" : "transparent"}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
          <circle
            cx={toPos.x}
            cy={toPos.y}
            r={isHovered ? 6 : 4}
            fill={isHovered ? color : "transparent"}
            stroke={isHovered ? "white" : "transparent"}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        </>
      )}
    </g>
  );
}
