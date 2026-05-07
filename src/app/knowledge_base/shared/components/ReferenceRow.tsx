"use client";

import type { ReactElement } from "react";
import { Paperclip, ArrowUpRight, X } from "lucide-react";

export interface ReferenceRowProps {
  filePath: string;
  label: string;
  source: "attachment" | "wiki-link";
  readOnly?: boolean;
  onPreview?: (filePath: string) => void;
  onDetach?: (filePath: string) => void;
}

export function ReferenceRow({
  filePath,
  label,
  source,
  readOnly = false,
  onPreview,
  onDetach,
}: ReferenceRowProps): ReactElement {
  const Icon = source === "attachment" ? Paperclip : ArrowUpRight;
  const iconTestId = `reference-row-icon-${source}`;
  const showDetach = !readOnly && source === "attachment" && onDetach !== undefined;

  return (
    <li className="flex items-center gap-1 text-[12px]">
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={() => onPreview?.(filePath)}
        className="flex flex-1 items-center gap-1 truncate text-left hover:underline"
      >
        <Icon className="h-3 w-3 shrink-0 text-mute" data-testid={iconTestId} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
      {showDetach && (
        <button
          type="button"
          aria-label={`Detach ${label}`}
          onClick={() => onDetach?.(filePath)}
          className="rounded p-0.5 text-mute hover:bg-line/20 hover:text-warn"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
