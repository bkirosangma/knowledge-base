"use client";

import React, { useState } from "react";
import { FileText, Network, Image as ImageIcon, Music } from "lucide-react";
import type { AttachmentBuckets, EntityAttachmentTarget } from "../../document/types";
import type { PreviewItemType } from "../components/AttachmentPreviewModal";
import DetachDocModal from "../components/DetachDocModal";
import { Section } from "./shared";

interface AttachmentsSectionProps {
  buckets: AttachmentBuckets;
  onPreview: (filename: string, type: PreviewItemType) => void;
  onDetach: (filename: string, type: PreviewItemType) => void;
  onAttach: () => void;
  readOnly?: boolean;
  /**
   * Optional cascade-detach wiring. When ALL three are provided AND the row's
   * type is "document", the Detach button opens a confirmation modal showing
   * other references and offering to delete the file. Otherwise the bare
   * `onDetach` callback is invoked directly.
   *
   * The trio is required: `entityScope` identifies the owning entity for the
   * reference walk; `getDocumentReferences` returns the cross-references that
   * the modal lists; `deleteDocumentWithCleanup` performs the cascade delete
   * when the user opts in.
   */
  entityScope?: { entityType: EntityAttachmentTarget; entityId: string };
  getDocumentReferences?: (
    filePath: string,
    owner: { entityType: EntityAttachmentTarget; entityId: string },
  ) => { attachments: { entityType: string; entityId: string }[]; wikiBacklinks: string[] };
  deleteDocumentWithCleanup?: (filePath: string) => Promise<void>;
}

type GroupKey = keyof AttachmentBuckets;

const GROUPS: { key: GroupKey; type: PreviewItemType; label: string; Icon: typeof FileText }[] = [
  { key: "docs", type: "document", label: "Documents", Icon: FileText },
  { key: "diagrams", type: "diagram", label: "Diagrams", Icon: Network },
  { key: "svgs", type: "svg", label: "SVG", Icon: ImageIcon },
  { key: "tabs", type: "tab", label: "Tabs", Icon: Music },
];

export function AttachmentsSection({
  buckets,
  onPreview,
  onDetach,
  onAttach,
  readOnly = false,
  entityScope,
  getDocumentReferences,
  deleteDocumentWithCleanup,
}: AttachmentsSectionProps) {
  const total =
    buckets.docs.length + buckets.diagrams.length + buckets.svgs.length + buckets.tabs.length;

  // Cascade-detach modal state. Only used when the optional cascade props are
  // wired AND the user clicks Detach on a "document"-type row. Other types
  // skip the modal — backlink walks are document-specific today.
  const [detachTarget, setDetachTarget] = useState<{ filename: string; type: PreviewItemType } | null>(null);
  const cascadeReady =
    entityScope !== undefined && getDocumentReferences !== undefined && deleteDocumentWithCleanup !== undefined;
  const detachRefs = detachTarget && cascadeReady
    ? getDocumentReferences!(detachTarget.filename, entityScope!)
    : null;

  const handleDetachClick = (filename: string, type: PreviewItemType) => {
    if (cascadeReady && type === "document") {
      setDetachTarget({ filename, type });
      return;
    }
    onDetach(filename, type);
  };

  return (
    <Section title={`Attachments${total > 0 ? ` (${total})` : ""}`}>
      <div className="flex flex-col gap-2">
        {GROUPS.map(({ key, type, label, Icon }) => {
          const rows = buckets[key];
          if (rows.length === 0) return null;
          return (
            <div key={key} data-testid={`attachment-group-${key}`}>
              <h5 className="text-[10px] uppercase text-mute tracking-wide mb-1">{label}</h5>
              <div className="flex flex-col gap-1">
                {rows.map((row) => (
                  <div
                    key={row.filename}
                    data-testid={`attachment-row-${row.filename}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-line text-xs"
                  >
                    <Icon size={12} className="flex-shrink-0 text-accent" />
                    <button
                      type="button"
                      data-testid={`attachment-preview-${row.filename}`}
                      onClick={() => onPreview(row.filename, type)}
                      className="flex-1 text-left text-accent hover:underline truncate"
                    >
                      {row.title || row.filename.split("/").pop()}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        data-testid={`attachment-detach-${row.filename}`}
                        onClick={() => handleDetachClick(row.filename, type)}
                        className="text-[10px] text-mute hover:text-danger"
                      >
                        Detach
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            data-testid="attachment-attach-button"
            onClick={onAttach}
            className="self-start text-xs text-accent hover:underline mt-1"
          >
            + Attach
          </button>
        )}
      </div>

      {detachTarget && detachRefs && (
        <DetachDocModal
          docPath={detachTarget.filename}
          attachments={detachRefs.attachments}
          wikiBacklinks={detachRefs.wikiBacklinks}
          onCancel={() => setDetachTarget(null)}
          onConfirm={async (alsoDelete) => {
            const target = detachTarget;
            setDetachTarget(null);
            onDetach(target.filename, target.type);
            if (alsoDelete) await deleteDocumentWithCleanup!(target.filename);
          }}
        />
      )}
    </Section>
  );
}
