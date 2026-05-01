"use client";

// Diagram toolbar overflow menu (KB-013).
//
// At viewport widths <= COMPACT_BREAKPOINT_PX, the secondary toggles
// (Live / Labels / Minimap) collapse into a `⋯` popover so the primary
// controls (zoom + auto-arrange) stay visible without wrapping.

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Activity, Tag, Map as MapIcon } from "lucide-react";

interface DiagramToolbarOverflowProps {
  isLive: boolean;
  onToggleLive: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
}

export default function DiagramToolbarOverflow({
  isLive,
  onToggleLive,
  showLabels,
  onToggleLabels,
  showMinimap,
  onToggleMinimap,
}: DiagramToolbarOverflowProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const itemClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
      active ? "text-accent" : "text-ink-2"
    } hover:bg-surface-2`;

  return (
    <div className="relative" ref={wrapRef} data-testid="diagram-toolbar-overflow">
      <button
        type="button"
        data-testid="diagram-toolbar-overflow-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More toolbar options"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-line bg-surface text-mute hover:text-ink-2 transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Diagram toolbar overflow"
          data-testid="diagram-toolbar-overflow-menu"
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-surface border border-line rounded-md shadow-lg overflow-hidden"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={isLive}
            data-testid="overflow-item-live"
            onClick={() => {
              onToggleLive();
              setOpen(false);
            }}
            className={itemClass(isLive)}
          >
            <Activity size={13} />
            <span className="flex-1">Live data flow</span>
            {isLive && <span aria-hidden="true">✓</span>}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showLabels}
            data-testid="overflow-item-labels"
            onClick={() => {
              onToggleLabels();
              setOpen(false);
            }}
            className={itemClass(showLabels)}
          >
            <Tag size={13} />
            <span className="flex-1">Connection labels</span>
            {showLabels && <span aria-hidden="true">✓</span>}
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showMinimap}
            data-testid="overflow-item-minimap"
            onClick={() => {
              onToggleMinimap();
              setOpen(false);
            }}
            className={itemClass(showMinimap)}
          >
            <MapIcon size={13} />
            <span className="flex-1">Minimap</span>
            {showMinimap && <span aria-hidden="true">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
