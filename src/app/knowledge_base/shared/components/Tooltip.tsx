"use client";

import React, { useId } from "react";

export interface TooltipProps {
  /** Visible text shown in the bubble and exposed via `aria-describedby`. */
  label: string;
  /** A single focusable element (typically a button). */
  children: React.ReactElement;
  /** Bubble placement relative to the child. Default `"top"`. */
  placement?: "top" | "bottom";
}

/**
 * Keyboard-reachable tooltip wrapper for icon buttons (KB-036).
 *
 * The native `title` attribute is unavailable to keyboard users (it only
 * shows on hover, not focus) and hides behind a multi-second OS delay.
 * `<Tooltip>` renders a real `[role="tooltip"]` bubble that surfaces
 * instantly on `:hover` and `:focus-visible`, and links it to the wrapped
 * control via `aria-describedby` so screen readers can announce the
 * description in addition to the existing `aria-label`.
 *
 * Disabled controls suppress the bubble (matches `.kb-table-toolbar`).
 *
 * Test note: the bubble text is always in the DOM (visibility flips via
 * CSS), so `getByText('Foo')` strict-mode-fails when "Foo" is also used
 * as a tooltip label. Prefer `getByRole` / `getByLabelText` for triggers
 * that share their label with other visible text.
 */
export function Tooltip({ label, children, placement = "top" }: TooltipProps) {
  const id = useId();
  const existing = (children.props as { "aria-describedby"?: string })[
    "aria-describedby"
  ];
  const describedBy = existing ? `${existing} ${id}` : id;
  const child = React.cloneElement(children, {
    "aria-describedby": describedBy,
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <span className={`kb-tooltip kb-tooltip--${placement}`}>
      {child}
      <span id={id} role="tooltip" className="kb-tooltip__bubble">
        {label}
      </span>
    </span>
  );
}
