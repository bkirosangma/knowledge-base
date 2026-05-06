"use client";

import React from "react";
import { FileText, Network, Image as ImageIcon, Music } from "lucide-react";

export interface AttachmentCounts {
  docs: number;
  diagrams: number;
  svgs: number;
  tabs: number;
}

const TYPE_GLYPH = {
  docs: FileText,
  diagrams: Network,
  svgs: ImageIcon,
  tabs: Music,
} as const;

const TYPE_LABEL = {
  docs: "docs",
  diagrams: "diagrams",
  svgs: "svgs",
  tabs: "tabs",
} as const;

interface AttachmentIndicatorProps {
  counts: AttachmentCounts;
  color: string;
  position: { x: number; y: number };
  onClick: () => void;
  testId: string;
}

export function AttachmentIndicator({
  counts,
  color,
  position,
  onClick,
  testId,
}: AttachmentIndicatorProps) {
  const populated = (Object.keys(counts) as Array<keyof AttachmentCounts>).filter(
    (k) => counts[k] > 0,
  );

  if (populated.length === 0) return null;

  const ariaLabel = `Attachments: ${populated.map((k) => TYPE_LABEL[k]).join(", ")}`;

  return (
    <button
      type="button"
      data-testid={`attachment-indicator-${testId}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: position.x, top: position.y, borderColor: color }}
      className="absolute flex items-center gap-0.5 px-1.5 py-0.5 bg-surface-1 border rounded-full shadow-sm hover:bg-surface-2"
      aria-label={ariaLabel}
    >
      {populated.map((kind) => {
        const Glyph = TYPE_GLYPH[kind];
        return (
          <Glyph
            key={kind}
            data-testid={`attachment-indicator-glyph-${kind}`}
            size={11}
            color={color}
          />
        );
      })}
    </button>
  );
}
