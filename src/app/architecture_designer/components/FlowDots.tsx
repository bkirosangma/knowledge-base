import React from "react";

const FlowDots = React.memo(function FlowDots({ lines, world, isZooming, draggingEndpointId, draggingId, draggingLayerId }: {
  lines: { id: string; path: string; color: string }[];
  world: { x: number; y: number; w: number; h: number };
  isZooming: boolean;
  draggingEndpointId: string | null;
  draggingId: string | null;
  draggingLayerId: string | null;
}) {
  return (
    <svg
      className={`absolute pointer-events-none ${isZooming ? "paused-animations" : ""}`}
      style={{ zIndex: 6, left: world.x, top: world.y, width: world.w, height: world.h, willChange: 'contents' }}
      viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
    >
      {lines.map((line) => {
        const isBeingDragged = draggingEndpointId === line.id;
        const dimmed = (!!draggingEndpointId && !isBeingDragged) || !!draggingId || !!draggingLayerId;
        if (isBeingDragged || dimmed) return null;
        const dotFill = line.color === "#10b981" ? "#059669" : line.color === "#64748b" ? "#475569" : "#2563eb";
        return (
          <circle key={line.id} r="4" fill={dotFill}>
            <animateMotion dur="2.5s" repeatCount="indefinite" path={line.path} />
          </circle>
        );
      })}
    </svg>
  );
});

export default FlowDots;
