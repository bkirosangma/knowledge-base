"use client";

import type { ReactElement } from "react";
import { ReferenceRow } from "./ReferenceRow";
import {
  mergeAttachmentsWithBacklinks,
  type BacklinkRef,
} from "../utils/mergeAttachmentsWithBacklinks";

interface DocLite {
  filename: string;
  title?: string;
}

export interface FileLevelReferencesGroupProps {
  /** Path of the file these references attach to (purely for parent context — not rendered). */
  filePath: string;
  /** Pre-filtered list of doc paths that are attached to this file. */
  attachmentPaths: string[];
  /** Pre-filtered list of wiki-link backlinks pointing to this file. */
  backlinks: BacklinkRef[];
  /** All known docs in the vault, used to resolve titles for the merged rows. */
  documents: DocLite[];
  readOnly?: boolean;
  onPreview?: (path: string) => void;
  onDetach?: (path: string) => void;
  /** When provided + not readOnly, renders a "+ Attach document" affordance. */
  onAttach?: () => void;
}

export function FileLevelReferencesGroup({
  attachmentPaths,
  backlinks,
  documents,
  readOnly = false,
  onPreview,
  onDetach,
  onAttach,
}: FileLevelReferencesGroupProps): ReactElement {
  const rows = mergeAttachmentsWithBacklinks(attachmentPaths, backlinks);
  const docByPath = new Map(documents.map((d) => [d.filename, d]));

  return (
    <div className="flex flex-col gap-1">
      {rows.length === 0 ? (
        <p className="text-[11px] text-mute">No references</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => {
            const doc = docByPath.get(row.sourcePath);
            const filename = row.sourcePath.split("/").pop() ?? row.sourcePath;
            const label =
              doc?.title && doc.title.trim() !== "" ? doc.title : filename;
            return (
              <ReferenceRow
                key={row.sourcePath}
                filePath={row.sourcePath}
                label={label}
                source={row.source}
                readOnly={readOnly}
                onPreview={onPreview}
                onDetach={onDetach}
              />
            );
          })}
        </ul>
      )}
      {!readOnly && onAttach !== undefined && (
        <button
          type="button"
          data-testid="file-references-attach"
          onClick={onAttach}
          className="self-start text-xs text-accent hover:underline"
        >
          + Attach document
        </button>
      )}
    </div>
  );
}
