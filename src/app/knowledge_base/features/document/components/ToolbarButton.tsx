"use client";

import React from "react";
import { Tooltip } from "../../../shared/components/Tooltip";

/**
 * Small rectangular icon button used across the document-editor toolbar
 * (bold/italic/heading/etc.). Active state has a blue pill background; the
 * disabled state fades the button and changes the cursor.
 *
 * Wrapped in `<Tooltip>` so the `title` prop surfaces as a keyboard-reachable
 * bubble (KB-036) instead of a delayed native browser tooltip.
 */
export function TBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={title}>
      <button
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        disabled={disabled}
        aria-label={title}
        aria-pressed={active}
        className={`p-1.5 rounded transition-colors ${
          active
            ? "bg-blue-100 text-blue-700"
            : "text-mute hover:bg-surface-2 hover:text-ink-2"
        } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Vertical separator between toolbar button groups. */
export function Sep() {
  return <div className="w-px h-5 bg-line mx-0.5" />;
}
