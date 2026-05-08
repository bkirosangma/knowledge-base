"use client";

import React from "react";

interface Props {
  folderName: string;
  onInitialize: () => void;
  onPickDifferent: () => void;
}

export function UninitializedVaultSplash({
  folderName,
  onInitialize,
  onPickDifferent,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      className="fixed inset-0 z-40 flex items-center justify-center bg-surface p-8"
    >
      <div className="max-w-md text-center">
        <p className="text-lg font-medium text-ink">
          {folderName} is not yet a knowledge-base vault.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-white hover:opacity-90 transition-opacity"
            onClick={onInitialize}
          >
            Initialize this vault
          </button>
          <button
            type="button"
            className="rounded border border-line px-4 py-2 hover:bg-surface-2 transition-colors"
            onClick={onPickDifferent}
          >
            Open a different folder
          </button>
        </div>
      </div>
    </div>
  );
}
