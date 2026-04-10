import type { CanvasPatch } from "./Canvas";

interface DiagramControlsProps {
  world: { w: number; h: number };
  patches: CanvasPatch[];
  zoom: number;
}

export default function DiagramControls({
  world, patches, zoom,
}: DiagramControlsProps) {
  return (
    <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-t border-slate-200 px-4 py-1 z-20">
      <div className="flex items-center gap-4">
        <span className="text-[11px] text-slate-400 font-mono">
          {world.w}&times;{world.h}px
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          {patches.length} patch{patches.length !== 1 ? "es" : ""}
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
