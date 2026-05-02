"use client";

// ExportMenu (KB-011 / EXPORT-9.4).
//
// Sits in `PaneHeader` as a "children" slot. The menu's item set is
// chosen by `getExportItems(paneType)` — the trigger is hidden when
// the focused pane has no exportable items (graph / graphify / search).
//
// Each pane provides handlers for the items it supports; the menu
// stays UI-only (no diagram-data or document-content knowledge).

import React, { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import type { PaneType } from "../../shell/ToolbarContext";
import { getExportItems, type ExportItemId } from "./getExportItems";

export interface ExportHandlers {
  svg?: () => void | Promise<void>;
  png?: () => void | Promise<void>;
  print?: () => void;
}

interface ExportMenuProps {
  paneType: PaneType | null | undefined;
  handlers: ExportHandlers;
}

const LABELS: Record<ExportItemId, string> = {
  svg: "Export as SVG",
  png: "Export as PNG",
  print: "Print / Save as PDF",
};

export default function ExportMenu({ paneType, handlers }: ExportMenuProps) {
  const items = getExportItems(paneType);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (items.length === 0) return null;

  const fire = (id: ExportItemId) => {
    setOpen(false);
    const handler = handlers[id];
    if (handler) void handler();
  };

  return (
    <div className="relative" ref={wrapRef} data-testid="export-menu">
      <button
        type="button"
        data-testid="export-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-line bg-surface text-ink-2 hover:bg-surface-2 transition-colors"
      >
        <Download size={14} />
        <span>Export</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Export"
          data-testid="export-menu-list"
          className="absolute right-0 mt-1 z-50 min-w-[180px] bg-surface border border-line rounded-md shadow-lg overflow-hidden"
        >
          {items.map((id) => {
            const enabled = !!handlers[id];
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                disabled={!enabled}
                data-testid={`export-menu-item-${id}`}
                onClick={() => enabled && fire(id)}
                className={`w-full text-left px-3 py-1.5 text-xs ${
                  enabled
                    ? "text-ink-2 hover:bg-surface-2 cursor-pointer"
                    : "text-mute cursor-not-allowed"
                }`}
              >
                {LABELS[id]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
