"use client";

import type { ComponentType, ReactElement, SVGProps } from "react";
import { Paperclip, ArrowUpRight, X } from "lucide-react";

export interface ReferenceRowProps {
  filePath: string;
  label: string;
  source: "attachment" | "wiki-link";
  /**
   * Optional override for the leading icon. When provided, this icon
   * replaces the default source-based icon (Paperclip/ArrowUpRight).
   * Caller should pass a Lucide-compatible icon component (`FileText`,
   * `Network`, `ImageIcon`, `Music`, etc).
   */
  Icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  readOnly?: boolean;
  onPreview?: (filePath: string) => void;
  onDetach?: (filePath: string) => void;
}

export function ReferenceRow({
  filePath,
  label,
  source,
  Icon: IconOverride,
  readOnly = false,
  onPreview,
  onDetach,
}: ReferenceRowProps): ReactElement {
  const DefaultIcon = source === "attachment" ? Paperclip : ArrowUpRight;
  const ResolvedIcon = IconOverride ?? DefaultIcon;
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
        <ResolvedIcon className="h-3 w-3 shrink-0 text-mute" data-testid={iconTestId} aria-hidden="true" />
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
