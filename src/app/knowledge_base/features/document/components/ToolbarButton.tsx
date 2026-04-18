"use client";

import React from "react";

/**
 * Small rectangular icon button used across the document-editor toolbar
 * (bold/italic/heading/etc.). Active state has a blue pill background; the
 * disabled state fades the button and changes the cursor.
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
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

/** Vertical separator between toolbar button groups. */
export function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5" />;
}
