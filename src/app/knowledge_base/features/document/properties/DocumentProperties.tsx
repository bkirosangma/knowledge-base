"use client";

import { useMemo } from "react";
import { Hash, Clock, Link2, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import HistoryPanel from "../../../shared/components/HistoryPanel";
import { Tooltip } from "../../../shared/components/Tooltip";
import type { HistoryEntry } from "../../../shared/utils/historyPersistence";
import UnlinkedMentions from "../components/UnlinkedMentions";

interface HistoryPanelBridge {
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
}

interface DocumentPropertiesProps {
  filePath: string | null;
  content: string;
  outbound: { target: string; section?: string }[] | null;
  backlinks: { sourcePath: string; section?: string }[];
  onNavigateLink?: (path: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  history?: HistoryPanelBridge | null;
  readOnly?: boolean;
  /** All vault file paths — drives the unlinked-mentions detector. */
  allFilePaths?: string[];
  /**
   * Replace the document body. Wired upstream to `updateContent +
   * history.onContentChange` so the dirty / save / undo plumbing fires.
   * When omitted, "Convert all" buttons hide.
   */
  onConvertMention?: (newContent: string) => void;
}

export default function DocumentProperties({
  filePath,
  content,
  outbound,
  backlinks,
  onNavigateLink,
  collapsed,
  onToggleCollapse,
  history,
  readOnly,
  allFilePaths,
  onConvertMention,
}: DocumentPropertiesProps) {
  const stats = useMemo(() => {
    if (!content) return { words: 0, chars: 0, readingTime: "0 min" };
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readingTime: `${minutes} min` };
  }, [content]);

  if (collapsed) {
    return (
      <div className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden" style={{ width: 36 }}>
        <Tooltip label="Expand properties">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center px-2 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
            aria-label="Expand properties"
          >
            <ChevronLeft size={16} className="text-slate-500" />
          </button>
        </Tooltip>
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden" style={{ width: 280 }}>
        {onToggleCollapse ? (
          <Tooltip label="Collapse properties">
            <button
              onClick={onToggleCollapse}
              className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 hover:bg-slate-50 transition-colors w-full"
              aria-label="Collapse properties"
            >
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
              <ChevronRight size={14} className="ml-auto text-slate-400" />
            </button>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
          </div>
        )}
        <div className="p-4 text-sm text-slate-400">No document selected</div>
      </div>
    );
  }

  const filename = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden" style={{ width: 280 }}>
      {/* Header */}
      {onToggleCollapse ? (
        <Tooltip label="Collapse properties">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 hover:bg-slate-50 transition-colors w-full"
            aria-label="Collapse properties"
          >
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
            <span className="text-xs text-slate-400 truncate">{filename}</span>
            <ChevronRight size={14} className="ml-auto text-slate-400 flex-shrink-0" />
          </button>
        </Tooltip>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
          <span className="text-xs text-slate-400 truncate">{filename}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Stats */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Stats</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Hash size={12} className="text-slate-400" />
              {stats.words.toLocaleString()} words
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock size={12} className="text-slate-400" />
              {stats.readingTime} read
            </div>
          </div>
        </div>

        {/* Outbound Links */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Links ({outbound?.length ?? 0})
          </div>
          {outbound?.length ? (
            <div className="space-y-1">
              {outbound.map((link, i) => (
                <button
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline w-full text-left"
                  onClick={() => onNavigateLink?.(link.target)}
                >
                  <Link2 size={11} className="flex-shrink-0" />
                  <span className="truncate">{link.target}{link.section ? `#${link.section}` : ""}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No outbound links</div>
          )}
        </div>

        {/* Backlinks */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Backlinks ({backlinks.length})
          </div>
          {backlinks.length > 0 ? (
            <div className="space-y-1">
              {backlinks.map((bl, i) => (
                <button
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline w-full text-left"
                  onClick={() => onNavigateLink?.(bl.sourcePath)}
                >
                  <ArrowLeft size={11} className="flex-shrink-0" />
                  <span className="truncate">{bl.sourcePath}{bl.section ? `#${bl.section}` : ""}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No backlinks</div>
          )}
        </div>

        {/* Unlinked mentions — surfaces tokens matching other vault filenames
            but not yet wrapped in [[...]]. Per-row "Convert all" wraps every
            occurrence; mutates the doc through onConvertMention so the
            shell's dirty + save + undo plumbing all fire normally. */}
        {allFilePaths && allFilePaths.length > 0 && (
          <UnlinkedMentions
            content={content}
            allFilePaths={allFilePaths}
            currentPath={filePath}
            onConvert={onConvertMention}
            readOnly={readOnly}
          />
        )}
      </div>
      {history && (
        <HistoryPanel
          entries={history.entries}
          currentIndex={history.currentIndex}
          savedIndex={history.savedIndex}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.onUndo}
          onRedo={history.onRedo}
          onGoToEntry={history.onGoToEntry}
          collapsed={history.collapsed}
          onToggleCollapse={history.onToggleCollapse}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
