import type { CanvasPatch } from "./Canvas";

interface DiagramControlsProps {
  isLive: boolean;
  setIsLive: (v: boolean) => void;
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  showMinimap: boolean;
  setShowMinimap: (v: boolean) => void;
  world: { w: number; h: number };
  patches: CanvasPatch[];
  zoom: number;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center gap-3 cursor-pointer group" onClick={onChange}>
      <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{label}</span>
      <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${value ? "bg-blue-600" : "bg-slate-300"}`}>
        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${value ? "translate-x-5" : ""}`} />
      </div>
    </div>
  );
}

export default function DiagramControls({
  isLive, setIsLive,
  showLabels, setShowLabels,
  showMinimap, setShowMinimap,
  world, patches, zoom,
}: DiagramControlsProps) {
  return (
    <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 py-4 z-20">
      <div className="flex items-center gap-8">
        <Toggle label="Live Data Flow" value={isLive} onChange={() => setIsLive(!isLive)} />
        <Toggle label="Show Labels" value={showLabels} onChange={() => setShowLabels(!showLabels)} />
        <Toggle label="Minimap" value={showMinimap} onChange={() => setShowMinimap(!showMinimap)} />
        <span className="text-xs text-slate-400 font-mono">
          {world.w}&times;{world.h}px ({patches.length} patch{patches.length !== 1 ? "es" : ""}) {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
