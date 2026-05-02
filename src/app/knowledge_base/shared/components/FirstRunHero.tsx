"use client";

// First-run hero (KB-012). Replaces the right-pane empty state when the
// user has never opened a vault. The explorer's own "no folder" UI on
// the left is unaffected per the spec.

import React, { useState } from "react";
import { Folder, Sparkles, ChevronDown, Smartphone } from "lucide-react";
import { seedSampleVault } from "./seedSampleVault";
import { useViewport } from "../hooks/useViewport";

export interface FirstRunHeroProps {
  /** Show the native picker and open the chosen folder. Wired to
   *  `useFileExplorer.openFolder`. */
  onOpenFolder: () => void | Promise<void>;
  /** Show the picker, write the sample vault into the chosen folder,
   *  then open it. Wired to `useFileExplorer.openFolderWithSeed`. */
  onOpenWithSeed: (
    seed: (handle: FileSystemDirectoryHandle) => Promise<void>,
  ) => Promise<{ handle: FileSystemDirectoryHandle } | null>;
}

type Status =
  | { kind: "idle" }
  | { kind: "seeding" }
  | { kind: "error"; message: string };

export default function FirstRunHero({ onOpenFolder, onOpenWithSeed }: FirstRunHeroProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showAbout, setShowAbout] = useState(false);
  const { isMobile } = useViewport();

  const handleSample = async () => {
    setStatus({ kind: "seeding" });
    try {
      const result = await onOpenWithSeed((handle) => seedSampleVault(handle).then(() => undefined));
      if (!result) {
        // User cancelled the picker — back to idle, no error.
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "idle" });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to set up the sample vault.",
      });
    }
  };

  const seeding = status.kind === "seeding";

  return (
    <div
      className="flex-1 flex items-center justify-center bg-surface-2 overflow-auto"
      data-testid="first-run-hero"
    >
      <div className="max-w-[640px] w-full mx-auto px-8 py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-mute">
            Welcome
          </span>
          <h1 className="text-2xl font-semibold text-ink-2">
            Your knowledge base, in a folder you control
          </h1>
          <p className="text-sm leading-relaxed text-mute">
            Notes, diagrams, and images live as plain Markdown and JSON
            files in a folder you pick — no database, no cloud account.
            Everything cross-references via{" "}
            <code className="font-mono text-[12px] bg-surface px-1 py-0.5 rounded border border-line">
              [[wiki-links]]
            </code>{" "}
            and stays editable with any other tool.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            data-testid="first-run-open-folder"
            onClick={() => void onOpenFolder()}
            disabled={seeding}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Folder size={16} />
            Open Vault
          </button>
          <button
            type="button"
            data-testid="first-run-sample-vault"
            onClick={() => void handleSample()}
            disabled={seeding}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold border border-line bg-surface text-ink-2 hover:bg-surface-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Sparkles size={16} />
            {seeding ? "Setting up sample…" : "Try with sample vault"}
          </button>
        </div>

        {status.kind === "error" && (
          <div
            role="alert"
            data-testid="first-run-error"
            className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2"
          >
            {status.message}
          </div>
        )}

        {isMobile && (
          <div
            role="note"
            data-testid="first-run-mobile-notice"
            className="flex items-start gap-2 text-xs rounded-md border border-line bg-surface px-3 py-2 text-mute"
          >
            <Smartphone size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="m-0 leading-relaxed">
              <span className="font-semibold text-ink-2">Mobile is for browsing.</span>{" "}
              Creating new files and switching vaults is desktop-only.
              Open this app on a larger screen for the full authoring
              experience.
            </p>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <button
            type="button"
            aria-expanded={showAbout}
            data-testid="first-run-about-toggle"
            onClick={() => setShowAbout((s) => !s)}
            className="inline-flex items-center gap-1 text-xs font-medium text-mute hover:text-ink-2 transition-colors"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showAbout ? "rotate-0" : "-rotate-90"}`}
            />
            What&apos;s a vault?
          </button>
          {showAbout && (
            <ul
              data-testid="first-run-about-list"
              className="mt-3 list-none p-0 m-0 flex flex-col gap-2 text-sm text-mute"
            >
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-blue-500">·</span>
                <span>
                  A vault is just a folder on your machine. The app reads and
                  writes files in it directly using the{" "}
                  <code className="font-mono text-[12px]">File System Access API</code>.
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-blue-500">·</span>
                <span>
                  Documents are <code className="font-mono text-[12px]">.md</code>;
                  diagrams are <code className="font-mono text-[12px]">.json</code>;
                  pasted images land in a hidden{" "}
                  <code className="font-mono text-[12px]">.attachments/</code> folder
                  inside the vault.
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-blue-500">·</span>
                <span>
                  Wiki-links between files (and the link index they build) are
                  stored in a hidden <code className="font-mono text-[12px]">.archdesigner/</code>{" "}
                  folder. Delete it any time — the app rebuilds the index on
                  the next vault open.
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
