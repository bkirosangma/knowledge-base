import { useRef } from "react";
import type { FlowDef } from "../types";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

interface FlowBreakWarningModalProps {
  description: string;
  brokenFlows: FlowDef[];
  onCancel: () => void;
  onConfirm: () => void;
}

export default function FlowBreakWarningModal({ description, brokenFlows, onCancel, onConfirm }: FlowBreakWarningModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // KB-031: focus trap — Tab cycles inside the dialog; Escape calls
  // `onCancel`; focus returns to the trigger on close.
  useFocusTrap(dialogRef, true, { onEscape: onCancel });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" className="bg-surface rounded-lg shadow-xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink mb-2">
          This will break {brokenFlows.length === 1 ? "a flow" : "flows"}
        </h3>
        <p className="text-xs text-ink-2 mb-3">{description}</p>
        <ul className="mb-4 space-y-1">
          {brokenFlows.map((f) => (
            <li key={f.id} className="text-xs text-ink-2 font-medium bg-surface-2 rounded px-2 py-1">{f.name}</li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-1.5 text-xs font-medium text-ink-2 bg-surface-2 hover:bg-slate-200 rounded-md transition-colors cursor-pointer" onClick={onCancel}>Cancel</button>
          <button className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors cursor-pointer" onClick={onConfirm}>Continue</button>
        </div>
      </div>
    </div>
  );
}
