"use client";

import type { ReactElement } from "react";
import type { DocumentMeta } from "../../document/types";
import { ReferenceRow } from "../../../shared/components/ReferenceRow";

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
        // Resolve title from the attachments list (only attachments carry titles).
        const doc = attachments.find((a) => a.filename === row.sourcePath);
        const label = doc?.title && doc.title.trim() !== "" ? doc.title : filename;
        return (
          <ReferenceRow
            key={row.sourcePath}
            filePath={row.sourcePath}
            label={label}
            source={row.source === "attachment" ? "attachment" : "wiki-link"}
            readOnly={readOnly}
            onPreview={onPreview}
            onDetach={onDetach}
          />
        );
      })}
    </ul>
  );
}
