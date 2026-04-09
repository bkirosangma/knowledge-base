import React from "react";

const FlowDots = React.memo(function FlowDots({ lines, world, isZooming, draggingEndpointId, draggingId, draggingLayerId, isLive, hoveredLineId, selectedLineIds }: {
  lines: { id: string; path: string; color: string; biDirectional?: boolean; flowDuration?: number }[];
  world: { x: number; y: number; w: number; h: number };
  isZooming: boolean;
  draggingEndpointId: string | null;
  draggingId: string | null;
  draggingLayerId: string | null;
  isLive: boolean;
  hoveredLineId: string | null;
  selectedLineIds: string[];
}) {
  return (
    <svg
      className={`absolute pointer-events-none ${isZooming ? "paused-animations" : ""}`}
      style={{ zIndex: 6, left: world.x, top: world.y, width: world.w, height: world.h, willChange: 'contents' }}
      viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
    >
      {lines.map((line) => {
        const isActive = isLive || line.id === hoveredLineId || selectedLineIds.includes(line.id);
        if (!isActive) return null;
        const isBeingDragged = draggingEndpointId === line.id;
        const dimmed = (!!draggingEndpointId && !isBeingDragged) || !!draggingId || !!draggingLayerId;
        if (isBeingDragged || dimmed) return null;
        const baseDur = line.flowDuration ?? 2.5;
        const dur = line.biDirectional ? baseDur * 2 : baseDur;
        return (
          <circle key={line.id} r="4" fill={line.color}>
            <animateMotion
              dur={`${dur}s`}
              repeatCount="indefinite"
              path={line.path}
              keyPoints={line.biDirectional ? "0;1;0" : "0;1"}
              keyTimes={line.biDirectional ? "0;0.5;1" : "0;1"}
              calcMode="linear"
            />
          </circle>
        );
      })}
    </svg>
  );
});

export default FlowDots;
