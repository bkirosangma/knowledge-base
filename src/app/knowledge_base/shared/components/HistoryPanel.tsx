"use client";

import { useRef, useEffect } from "react";
import { Undo2, Redo2, ChevronDown, ChevronRight } from "lucide-react";
import type { HistoryEntry } from "../utils/historyPersistence";

interface HistoryPanelProps {
  entries: HistoryEntry<unknown>[];
  currentIndex: number;
  savedIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGoToEntry: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function HistoryPanel({
  entries,
  currentIndex,
  savedIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGoToEntry,
  collapsed,
  onToggleCollapse,
  readOnly,
}: HistoryPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current || collapsed) return;
    const item = listRef.current.querySelector(`[data-index="${currentIndex}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [currentIndex, collapsed]);

  return (
    <div className="flex flex-col flex-shrink-0 border-t border-slate-200 bg-white">
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors flex-shrink-0"
      >
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          History
        </span>
        {entries.length > 1 && (
          <span className="text-[10px] text-slate-400 font-medium">
            {currentIndex + 1}/{entries.length}
          </span>
        )}
        {collapsed ? (
          <ChevronRight size={14} className="ml-auto text-slate-400" />
        ) : (
          <ChevronDown size={14} className="ml-auto text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="flex items-center gap-1 px-3 pb-1.5 flex-shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo || readOnly}
              className="p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Cmd+Z)"
            >
              <Undo2 size={14} className="text-slate-600" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo || readOnly}
              className="p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 size={14} className="text-slate-600" />
            </button>
          </div>

          <div ref={listRef} className="overflow-y-auto flex-shrink-0 max-h-[200px]">
            {entries.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No history yet</div>
            ) : (
              [...entries].reverse().map((entry, revIdx) => {
                const idx = entries.length - 1 - revIdx;
                const isCurrent = idx === currentIndex;
                const isFuture = idx > currentIndex;
                const isSaved = idx === savedIndex;

                return (
                  <button
                    key={entry.id}
                    data-index={idx}
                    onClick={() => onGoToEntry(idx)}
                    disabled={readOnly}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSaved ? "border-l-2 border-green-400" : "border-l-2 border-transparent"
                    } ${
                      isCurrent
                        ? "bg-blue-50 text-blue-700"
                        : isFuture
                          ? "text-slate-300 hover:bg-slate-50"
                          : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex-1 truncate">{entry.description}</div>
                    {isSaved && (
                      <span className="text-[9px] font-semibold text-green-600 bg-green-50 px-1 rounded flex-shrink-0">
                        saved
                      </span>
                    )}
                    <div className={`text-[10px] flex-shrink-0 ${isCurrent ? "text-blue-400" : "text-slate-300"}`}>
                      {relativeTime(entry.timestamp)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
