"use client";

import React from "react";
import { FolderOpen, BookOpen, Network } from "lucide-react";

export type MobileTab = "files" | "read" | "graph";

interface BottomNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

interface TabSpec {
  id: MobileTab;
  label: string;
  Icon: typeof FolderOpen;
  ariaLabel: string;
}

const TABS: readonly TabSpec[] = [
  { id: "files", label: "Files", Icon: FolderOpen, ariaLabel: "Files tab" },
  { id: "read",  label: "Read",  Icon: BookOpen,   ariaLabel: "Read tab" },
  { id: "graph", label: "Graph", Icon: Network,    ariaLabel: "Graph tab" },
];

/**
 * Fixed-bottom 3-tab nav for the mobile shell. Each tab is a 44 px tall
 * tap target so the row is at-spec for touch ergonomics. Active state
 * uses `text-accent`; inactive uses `text-mute`. `aria-selected` reflects
 * the active tab so screen readers announce state.
 */
export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      role="tablist"
      aria-label="Mobile shell navigation"
      data-testid="bottom-nav"
      className="flex-shrink-0 grid grid-cols-3 border-t border-line bg-surface"
    >
      {TABS.map(({ id, label, Icon, ariaLabel }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={ariaLabel}
            data-testid={`bottom-nav-${id}`}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 transition-colors ${
              isActive
                ? "text-accent"
                : "text-mute hover:text-ink-2"
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="text-xs leading-none">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
