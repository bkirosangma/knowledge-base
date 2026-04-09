import { useEffect, useRef } from "react";
import { Box, Layers, Trash2 } from "lucide-react";

export type ContextMenuTarget =
  | { type: "canvas" }
  | { type: "layer"; id: string }
  | { type: "element"; id: string };

export default function ContextMenu({
  x,
  y,
  target,
  onAddElement,
  onAddLayer,
  onDeleteElement,
  onDeleteLayer,
  onClose,
}: {
  x: number;
  y: number;
  target: ContextMenuTarget;
  onAddElement: () => void;
  onAddLayer: () => void;
  onDeleteElement: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  const btnClass = "flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] transition-colors";

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {target.type === "element" && (
        <button
          className={`${btnClass} text-red-600 hover:bg-red-50`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { onDeleteElement(target.id); onClose(); }}
        >
          <Trash2 size={14} />
          Delete Element
        </button>
      )}
      {target.type === "layer" && (
        <>
          <button
            className={`${btnClass} text-slate-700 hover:bg-slate-100`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { onAddElement(); onClose(); }}
          >
            <Box size={14} className="text-slate-400" />
            Add Element
          </button>
          <button
            className={`${btnClass} text-red-600 hover:bg-red-50`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { onDeleteLayer(target.id); onClose(); }}
          >
            <Trash2 size={14} />
            Delete Layer
          </button>
        </>
      )}
      {target.type === "canvas" && (
        <>
          <button
            className={`${btnClass} text-slate-700 hover:bg-slate-100`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { onAddElement(); onClose(); }}
          >
            <Box size={14} className="text-slate-400" />
            Add Element
          </button>
          <button
            className={`${btnClass} text-slate-700 hover:bg-slate-100`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => { onAddLayer(); onClose(); }}
          >
            <Layers size={14} className="text-slate-400" />
            Add Layer
          </button>
        </>
      )}
    </div>
  );
}
