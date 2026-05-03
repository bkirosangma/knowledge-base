"use client";

import type { ReactElement } from "react";
import { FileText, Paperclip, ArrowUpRight, X } from "lucide-react";
import type { DocumentMeta } from "../../document/types";

export interface TabReferencesListProps {
  attachments: DocumentMeta[];
  backlinks: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreview?: (path: string) => void;
  onDetach?: (docPath: string) => void;
}

type Row = { sourcePath: string; source: "attachment" | "backlink" };

function mergeRows(
  attachments: DocumentMeta[],
  backlinks: { sourcePath: string; section?: string }[],
): Row[] {
  const seen = new Map<string, Row>();
  for (const a of attachments) {
    seen.set(a.filename, { sourcePath: a.filename, source: "attachment" });
  }
  for (const b of backlinks) {
    if (!seen.has(b.sourcePath)) {
      seen.set(b.sourcePath, { sourcePath: b.sourcePath, source: "backlink" });
    }
  }
  return [...seen.values()];
}

export function TabReferencesList({
  attachments,
  backlinks,
  readOnly,
  onPreview,
  onDetach,
}: TabReferencesListProps): ReactElement {
  const rows = mergeRows(attachments, backlinks);

  if (rows.length === 0) {
    return <p className="text-[11px] text-mute">No references</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const filename = row.sourcePath.split("/").pop() ?? row.sourcePath;
        const Icon = row.source === "attachment" ? Paperclip : ArrowUpRight;
        return (
          <li
            key={row.sourcePath}
            data-testid="tab-reference-row"
            data-source={row.source}
            className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-xs"
          >
            <Icon size={12} className="flex-shrink-0 text-emerald-500" />
            <button
              type="button"
              onClick={() => onPreview?.(row.sourcePath)}
              className="flex flex-1 items-center gap-1 truncate text-left text-accent hover:underline"
            >
              <FileText size={11} className="flex-shrink-0 opacity-60" />
              {filename}
            </button>
            {!readOnly && row.source === "attachment" && onDetach && (
              <button
                type="button"
                data-testid="detach-reference"
                aria-label={`Detach ${filename}`}
                onClick={() => onDetach(row.sourcePath)}
                className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
              >
                <X size={11} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
