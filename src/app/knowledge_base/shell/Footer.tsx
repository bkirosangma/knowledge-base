"use client";

import { useEffect, useState } from "react";
import { FileText, LayoutGrid, Network } from "lucide-react";
import { useFooterContext } from "./FooterContext";
import { useToolbarContext, GRAPH_SENTINEL } from "./ToolbarContext";
import type { PaneEntry } from "./PaneManager";
import ConfirmPopover from "../shared/components/explorer/ConfirmPopover";
import { useFileWatcher } from "../shared/context/FileWatcherContext";

interface FooterProps {
  focusedEntry: PaneEntry | null;
  isSplit: boolean;
}

export default function Footer({ focusedEntry, isSplit }: FooterProps) {
  const { leftInfo, rightInfo } = useFooterContext();
  const { focusedPane } = useToolbarContext();
  const [resetConfirmPos, setResetConfirmPos] = useState<{ x: number; y: number } | null>(null);

  const info = focusedPane === "right" ? rightInfo : leftInfo;
  const isGraph = focusedEntry?.fileType === "graph" || focusedEntry?.filePath === GRAPH_SENTINEL;
  const filename = isGraph
    ? "Vault graph"
    : focusedEntry?.filePath.split("/").pop() ?? null;
  const FileIcon = isGraph
    ? Network
    : focusedEntry?.fileType === "document"
    ? FileText
    : LayoutGrid;
  const sideLabel = isSplit ? (focusedPane === "right" ? "Right" : "Left") : null;

  return (
    <div data-print-hide="true" className="flex-shrink-0 bg-surface/80 backdrop-blur-sm border-t border-line px-4 py-1 z-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {filename && (
            <div className="flex items-center gap-1.5 text-[11px] text-mute font-mono min-w-0">
              {sideLabel && (
                <span className="text-mute flex-shrink-0">[{sideLabel}]</span>
              )}
              <FileIcon size={12} className="text-mute flex-shrink-0" />
              <span className="truncate">{filename}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {info?.kind === "diagram" && (
            <>
              <span className="text-[11px] text-mute font-mono">
                {info.world.w}&times;{info.world.h}px
              </span>
              <span className="text-[11px] text-mute font-mono">
                {info.patches} patch{info.patches !== 1 ? "es" : ""}
              </span>
              <span className="text-[11px] text-mute font-mono">
                {Math.round(info.zoom * 100)}%
              </span>
            </>
          )}
          <LastSyncedChip />
          <button
            onClick={(e) => setResetConfirmPos({ x: e.clientX, y: e.clientY })}
            className="text-[11px] text-red-400 hover:text-red-600 font-mono cursor-pointer transition-colors"
            aria-label="Reset app — clears local storage and reloads"
          >
            Reset App
          </button>
        </div>
      </div>
      {resetConfirmPos && (
        <ConfirmPopover
          message="Clear all local state? This removes drafts, recent vaults, and view preferences. Files on disk are not affected."
          confirmLabel="Reset"
          confirmColor="red"
          position={resetConfirmPos}
          onConfirm={() => {
            localStorage.clear();
            window.location.reload();
          }}
          onCancel={() => setResetConfirmPos(null)}
        />
      )}
    </div>
  );
}

function LastSyncedChip() {
  const { lastSyncedAt } = useFileWatcher();
  // SSR + first paint render a stable 0s value with no time-derived
  // attributes; otherwise both `lastSyncedAt` and `Date.now()` (initialised
  // independently on server vs. client) produce a hydration mismatch on
  // the chip body and `title`. The mounted flag flips once on the client
  // so the live timer takes over post-hydration.
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<number>(lastSyncedAt);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return (
      <span
        data-testid="last-synced-chip"
        className="text-[11px] text-mute font-mono"
      >
        Last synced 0s ago
      </span>
    );
  }

  const ago = Math.max(0, Math.floor((now - lastSyncedAt) / 1000));
  // `en-GB` 24-hour format is locale-stable so dev-server SSR (which
  // defaults to `en-US` 12-hour format) and the browser produce the
  // same string for the title once hydrated.
  const stamp = new Date(lastSyncedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (
    <span
      data-testid="last-synced-chip"
      className="text-[11px] text-mute font-mono"
      title={`Last synced ${stamp}`}
    >
      Last synced {ago}s ago
    </span>
  );
}
