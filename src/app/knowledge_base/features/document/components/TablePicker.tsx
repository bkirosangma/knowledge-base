"use client";

import React, { useEffect, useRef, useState } from "react";
import { Table as TableIcon } from "lucide-react";
import { TBtn } from "./ToolbarButton";

/**
 * Excel-style grid popover for inserting a table of a chosen size.  Hovering
 * lights up the cells, mouseDown commits the size and closes the popover.
 */
export default function TablePicker({
  onSelect,
  disabled,
}: {
  onSelect: (rows: number, cols: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const maxRows = 8;
  const maxCols = 8;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // Auto-close the popover if the picker becomes disabled while open (e.g.,
  // user clicked into a table while the popover was showing).
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  return (
    <div ref={ref} className="relative">
      <TBtn
        onClick={() => { if (!disabled) setOpen(!open); }}
        active={open && !disabled}
        disabled={disabled}
        title={disabled ? "Insert table (not allowed inside a table)" : "Insert table"}
      >
        <TableIcon size={15} />
      </TBtn>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-2 z-50">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: maxRows * maxCols }, (_, i) => {
              const r = Math.floor(i / maxCols);
              const c = i % maxCols;
              const selected = hover && r <= hover.r && c <= hover.c;
              return (
                <div
                  key={i}
                  className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                    selected
                      ? "bg-blue-100 border-blue-400"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                  onMouseEnter={() => setHover({ r, c })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(r + 1, c + 1);
                    setOpen(false);
                    setHover(null);
                  }}
                />
              );
            })}
          </div>
          <div className="text-center text-xs text-slate-500 mt-1.5 font-medium">
            {hover ? `${hover.r + 1} × ${hover.c + 1} table` : "Select size"}
          </div>
        </div>
      )}
    </div>
  );
}
