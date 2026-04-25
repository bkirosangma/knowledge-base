"use client";

interface ConflictBannerProps {
  onReload: () => void;
  onKeep: () => void;
}

export default function ConflictBanner({
  onReload,
  onKeep,
}: ConflictBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 shrink-0"
    >
      <span className="flex-1">This file was changed outside the app.</span>
      <button
        onClick={onReload}
        className="px-3 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
      >
        Reload from disk
      </button>
      <button
        onClick={onKeep}
        className="px-3 py-1 rounded border border-amber-300 text-xs font-medium hover:bg-amber-100 transition-colors"
      >
        Keep my edits
      </button>
    </div>
  );
}
