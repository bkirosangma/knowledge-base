"use client";

import { useEffect, useRef, useState } from "react";

interface ConfirmPopoverProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  position: { x: number; y: number };
  confirmLabel?: string;
  confirmColor?: "red" | "blue";
  showDontAsk?: boolean;
  onDontAskChange?: (checked: boolean) => void;
}

export default function ConfirmPopover({
  message,
  onConfirm,
  onCancel,
  position,
  confirmLabel = "Confirm",
  confirmColor = "red",
  showDontAsk = false,
  onDontAskChange,
}: ConfirmPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dontAsk, setDontAsk] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onCancel]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [onCancel]);

  // Clamp position to stay in viewport
  const [adjusted, setAdjusted] = useState(position);
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setAdjusted({ x, y });
  }, [position]);

  const confirmBg = confirmColor === "red"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 p-4 min-w-[220px] max-w-[280px]"
      style={{ left: adjusted.x, top: adjusted.y }}
    >
      <p className="text-sm text-slate-700 mb-3">{message}</p>
      {showDontAsk && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs text-slate-500">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => {
              setDontAsk(e.target.checked);
              onDontAskChange?.(e.target.checked);
            }}
            className="rounded border-slate-300"
          />
          Don&apos;t ask me next time
        </label>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (showDontAsk && dontAsk) onDontAskChange?.(true);
            onConfirm();
          }}
          className={`px-3 py-1.5 text-xs font-medium text-white rounded transition-colors ${confirmBg}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
