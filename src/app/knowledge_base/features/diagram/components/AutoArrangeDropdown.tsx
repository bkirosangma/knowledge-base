"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";
import type { ArrangeAlgorithm } from "../utils/autoArrange";

export type { ArrangeAlgorithm };

export default function AutoArrangeDropdown({
  onSelect,
}: {
  onSelect: (algo: ArrangeAlgorithm) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const items: { key: ArrangeAlgorithm; label: string }[] = [
    { key: "hierarchical-tb", label: "Hierarchical (Top \u2192 Bottom)" },
    { key: "hierarchical-lr", label: "Hierarchical (Left \u2192 Right)" },
    { key: "force", label: "Force-Directed" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        title="Auto Arrange"
        onClick={() => setOpen(!open)}
      >
        <LayoutGrid size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[210px]">
          {items.map((item) => (
            <button
              key={item.key}
              className="block w-full text-left px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { onSelect(item.key); setOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
