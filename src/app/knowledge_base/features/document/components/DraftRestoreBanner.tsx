"use client";

interface DraftRestoreBannerProps {
  /** Epoch ms when the autosaved draft was last persisted. */
  savedAt: number;
  /** Drop the draft and reload disk content. */
  onDiscard: () => void;
  /** Keep the restored draft as the current (dirty) state. */
  onKeep: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * KB-002: surfaced when `useDocumentContent` restores a localStorage
 * draft on mount that differs from disk. [Discard] reverts to the
 * on-disk content, [Keep] dismisses the banner and leaves the restored
 * (dirty) content live so the next save flushes it back to disk.
 */
export default function DraftRestoreBanner({
  savedAt,
  onDiscard,
  onKeep,
}: DraftRestoreBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="draft-restore-banner"
      className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-900 shrink-0"
    >
      <span className="flex-1">
        Restored unsaved changes from {relativeTime(savedAt)}.
      </span>
      <button
        type="button"
        onClick={onDiscard}
        className="px-3 py-1 rounded border border-blue-300 text-xs font-medium hover:bg-blue-100 transition-colors"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onKeep}
        className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
      >
        Keep
      </button>
    </div>
  );
}
