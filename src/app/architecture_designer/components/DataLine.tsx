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
  onEndpointDragStart: (connectionId: string, end: "from" | "to", e: React.MouseEvent) => void;
  isDraggingEndpoint?: boolean;
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
  onEndpointDragStart,
  isDraggingEndpoint,
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
    >
      {/* Wide invisible hit area for hover */}
      <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
      {/* Visible line */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={isHovered || isDraggingEndpoint ? "3" : "1.5"}
        className={`transition-all ${isHovered || isDraggingEndpoint ? "opacity-100" : "opacity-70"}`}
      />
      {/* Animated dot */}
      {isLive && !hideDot && !isDraggingEndpoint && (
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
      {/* Draggable endpoint: FROM */}
      <circle
        cx={fromPos.x}
        cy={fromPos.y}
        r={isHovered || isDraggingEndpoint ? 6 : 4}
        fill={isHovered || isDraggingEndpoint ? color : "transparent"}
        stroke={isHovered || isDraggingEndpoint ? "white" : "transparent"}
        strokeWidth={1.5}
        style={{ cursor: "crosshair", pointerEvents: "auto" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onEndpointDragStart(id, "from", e);
        }}
      />
      {/* Draggable endpoint: TO */}
      <circle
        cx={toPos.x}
        cy={toPos.y}
        r={isHovered || isDraggingEndpoint ? 6 : 4}
        fill={isHovered || isDraggingEndpoint ? color : "transparent"}
        stroke={isHovered || isDraggingEndpoint ? "white" : "transparent"}
        strokeWidth={1.5}
        style={{ cursor: "crosshair", pointerEvents: "auto" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onEndpointDragStart(id, "to", e);
        }}
      />
    </g>
  );
}
