"use client";

import React from "react";
import { FileText, Network, Image as ImageIcon, Music } from "lucide-react";
import type { AttachmentBuckets } from "../../document/types";
import type { PreviewItemType } from "../components/AttachmentPreviewModal";
import { Section } from "./shared";

interface AttachmentsSectionProps {
  buckets: AttachmentBuckets;
  onPreview: (filename: string, type: PreviewItemType) => void;
  onDetach: (filename: string, type: PreviewItemType) => void;
  onAttach: () => void;
  readOnly?: boolean;
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
}: AttachmentsSectionProps) {
  const total =
    buckets.docs.length + buckets.diagrams.length + buckets.svgs.length + buckets.tabs.length;
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
                        onClick={() => onDetach(row.filename, type)}
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
    </Section>
  );
}
