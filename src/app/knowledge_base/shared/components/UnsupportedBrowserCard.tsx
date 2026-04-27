import React from "react";
import { FolderX } from "lucide-react";

/**
 * Full-pane fallback shown when the runtime lacks the File System Access API
 * (`window.showDirectoryPicker`). Replaces the previous hidden file `<input>`
 * fallback, which let users pick files but could never write back.
 */
export default function UnsupportedBrowserCard() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full max-w-md mx-auto p-8 bg-surface rounded-xl border border-line shadow-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <FolderX size={48} className="text-mute" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-ink">
          Knowledge Base needs the File System Access API.
        </h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          Your browser can&rsquo;t open a local vault folder yet. Open this app in{" "}
          <strong className="font-semibold">Chrome</strong>,{" "}
          <strong className="font-semibold">Edge</strong>,{" "}
          <strong className="font-semibold">Brave</strong>,{" "}
          <strong className="font-semibold">Arc</strong>, or{" "}
          <strong className="font-semibold">Opera</strong> to continue.
        </p>
      </div>
    </div>
  );
}
