"use client";

import React from "react";
import { ChevronDown, FolderOpen } from "lucide-react";

interface Props {
  currentVaultName: string;
  recents: string[];
  isUninitialised: boolean;
  onOpenVault: () => void;
  onSwitchVault: (path: string) => void;
  onInitializeVault: () => void;
}

export function VaultSwitcher({
  currentVaultName,
  recents,
  isUninitialised,
  onOpenVault,
  onSwitchVault,
  onInitializeVault,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-2 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FolderOpen size={14} aria-hidden />
        <span className="font-mono text-sm">{currentVaultName}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[16rem] rounded border border-line bg-surface shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left hover:bg-surface-2 transition-colors"
            onClick={() => {
              close();
              onOpenVault();
            }}
          >
            Open Vault…
          </button>
          {recents.length > 0 && (
            <div className="border-t border-line py-1">
              <div className="px-3 py-1 text-xs uppercase text-mute">Recent</div>
              {recents.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="menuitem"
                  className="block w-full truncate px-3 py-1 text-left font-mono text-xs hover:bg-surface-2 transition-colors"
                  onClick={() => {
                    close();
                    onSwitchVault(p);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {isUninitialised && (
            <button
              type="button"
              role="menuitem"
              className="block w-full border-t border-line px-3 py-2 text-left hover:bg-surface-2 transition-colors"
              onClick={() => {
                close();
                onInitializeVault();
              }}
            >
              Initialize Vault…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
