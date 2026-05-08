import { useEffect, useState } from "react";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

interface Props {
  open: boolean;
  /** File-extension filter (e.g. [".json"]). Empty = no filter. */
  extensions: string[];
  /** Vault-relative path string returned to caller, or null if dismissed. */
  onPick: (path: string | null) => void;
  title?: string;
}

/** Walks the vault directory tree breadth-first, returning vault-relative paths
 *  of files matching the optional extension filter. Skips dot-directories
 *  (e.g. `.archdesigner`, `.git`) to avoid surfacing config noise.
 */
async function listVaultFiles(extensions: string[]): Promise<string[]> {
  const queue: string[] = [""];
  const out: string[] = [];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    // Use .catch() rather than try/catch-await so the rejection handler is
    // attached synchronously at Promise creation — avoids a vitest 4 false
    // "unhandledRejection" event during the microtask gap before await settles.
    const entries = await tauriBridge.list(dir).catch(() => null);
    if (entries === null) continue; // skip permission-denied / vanished dirs
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.kind === "directory") {
        queue.push(e.path);
        continue;
      }
      if (extensions.length === 0 || extensions.some((ext) => e.path.endsWith(ext))) {
        out.push(e.path);
      }
    }
  }
  return out;
}

export function VaultFilePickerModal({ open, extensions, onPick, title = "Pick a file" }: Props) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPaths(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = await listVaultFiles(extensions);
        if (cancelled) return;
        setPaths(all.sort());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      }
    })();
    return () => { cancelled = true; };
  }, [open, extensions]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onPick(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPick]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={() => onPick(null)}
    >
      <div
        className="flex max-h-[60vh] w-full max-w-md flex-col rounded-md border border-line bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-3 py-2 text-sm font-medium text-ink">{title}</div>
        <div className="flex-1 overflow-auto p-2">
          {error && <div className="text-xs text-red-500" role="alert">{error}</div>}
          {paths === null && !error && <div className="p-4 text-xs text-mute">Loading…</div>}
          {paths?.length === 0 && (
            <div className="p-4 text-xs text-mute">No matching files in this vault.</div>
          )}
          <ul>
            {paths?.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded px-2 py-1 text-left font-mono text-xs text-ink-2 hover:bg-surface-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(p);
                  }}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            className="cursor-pointer rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:bg-surface"
            onClick={() => onPick(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
