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
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg p-8"
    >
      <div className="max-w-md text-center">
        <p className="text-lg font-medium">
          {folderName} is not yet a knowledge-base vault.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-bg"
            onClick={onInitialize}
          >
            Initialize this vault
          </button>
          <button
            type="button"
            className="rounded border border-border px-4 py-2"
            onClick={onPickDifferent}
          >
            Open a different folder
          </button>
        </div>
      </div>
    </div>
  );
}
