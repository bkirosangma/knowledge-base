"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandRegistry } from "../context/CommandRegistry";
import type { Command } from "../context/CommandRegistry";

// ─── CommandPalette ───────────────────────────────────────────────────────────

export default function CommandPalette() {
  const { commands, open, setOpen } = useCommandRegistry();
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // query is local — nothing outside the palette reads it, so no need for global state.
  const [query, setQuery] = useState("");

  // Filter to visible commands: `when` guard must pass (or be absent).
  // Then apply case-insensitive substring match on title.
  const filtered = useMemo<Command[]>(() => {
    const visible = commands.filter((c) => c.when === undefined || c.when());
    if (!query.trim()) return visible;
    const lc = query.toLowerCase();
    return visible.filter((c) => c.title.toLowerCase().includes(lc));
  }, [commands, query]);

  // Group the filtered list: preserve original insertion order of groups.
  const grouped = useMemo<{ group: string; items: Command[] }[]>(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filtered) {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [filtered]);

  // Flat ordered list for keyboard navigation.
  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const activeCmd = flatList[activeIndex] ?? null;

  // Reset active index when query changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Auto-focus input on open; restore focus on close.
  useEffect(() => {
    if (open) {
      // Capture the currently focused element before taking focus.
      prevFocusRef.current = document.activeElement as HTMLElement;
      // Small delay to let the DOM mount.
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => {
        clearTimeout(t);
        prevFocusRef.current?.focus();
        prevFocusRef.current = null;
      };
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen]);

  const execute = useCallback(
    (cmd: Command) => {
      close();
      cmd.run();
    },
    [close],
  );

  // Keyboard navigation.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        // Trap focus: items are navigated with arrow keys, input is the only focusable element.
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeCmd) execute(activeCmd);
        return;
      }
    },
    [flatList.length, activeCmd, close, execute],
  );

  if (!open) return null;

  // Announce result count for screen readers.
  const announcement =
    flatList.length === 0 ? "No commands" : `${flatList.length} command${flatList.length === 1 ? "" : "s"}`;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }} /* TODO: tokenize */
      onMouseDown={(e) => {
        // Close when clicking the backdrop, not the panel.
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Panel */}
      <div
        className="w-full max-w-[560px] mx-4 bg-surface rounded-lg shadow-xl border border-line overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Screen-reader live region — announces result count on each filter change */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {announcement}
        </div>

        {/* Search input */}
        <div className="border-b border-line px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full text-sm text-ink-2 placeholder-mute outline-none bg-transparent"
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls="cmd-listbox"
            aria-activedescendant={activeCmd ? `cmd-option-${activeCmd.id}` : undefined}
          />
        </div>

        {/* Results */}
        <ul
          id="cmd-listbox"
          role="listbox"
          aria-label="Commands"
          className="max-h-[360px] overflow-y-auto py-1 list-none m-0 p-0"
        >
          {flatList.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
              No matching commands
            </li>
          ) : (
            (() => {
              let flatIdx = 0;
              return grouped.map(({ group, items }) => (
                <li key={group} role="group" aria-label={group}>
                  {/* Group header — decorative, hidden from AT since the group aria-label suffices */}
                  <div
                    aria-hidden="true"
                    className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-mute select-none"
                  >
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const idx = flatIdx++;
                    const isActive = idx === activeIndex;
                    return (
                      <div
                        key={cmd.id}
                        id={`cmd-option-${cmd.id}`}
                        role="option"
                        aria-selected={isActive}
                        className={`flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors ${
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-ink-2 hover:bg-surface-2"
                        }`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          execute(cmd);
                        }}
                      >
                        <span className="flex-1 text-sm">{cmd.title}</span>
                        {cmd.shortcut && (
                          <kbd
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line bg-surface-2 text-mute"
                          >
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </div>
                    );
                  })}
                </li>
              ));
            })()
          )}
        </ul>
      </div>
    </div>
  );
}
