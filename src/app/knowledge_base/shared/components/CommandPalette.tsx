"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandRegistry } from "../context/CommandRegistry";
import type { Command } from "../context/CommandRegistry";

// ─── CommandPalette ───────────────────────────────────────────────────────────

export default function CommandPalette() {
  const { commands, open, setOpen, query, setQuery } = useCommandRegistry();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  // Reset active index when query changes or palette opens.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Auto-focus input on open.
  useEffect(() => {
    if (open) {
      // Small delay to let the DOM mount.
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setOpen, setQuery]);

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
        const cmd = flatList[activeIndex];
        if (cmd) execute(cmd);
        return;
      }
    },
    [flatList, activeIndex, close, execute],
  );

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
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
        className="w-full max-w-[560px] mx-4 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="border-b border-slate-100 px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full text-sm text-slate-800 placeholder-slate-400 outline-none bg-transparent"
            aria-label="Search commands"
          />
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1" role="listbox">
          {flatList.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No matching commands
            </div>
          ) : (
            (() => {
              let flatIdx = 0;
              return grouped.map(({ group, items }) => (
                <div key={group}>
                  {/* Group header */}
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 select-none">
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const idx = flatIdx++;
                    const isActive = idx === activeIndex;
                    return (
                      <div
                        key={cmd.id}
                        role="option"
                        aria-selected={isActive}
                        className={`flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors ${
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-700 hover:bg-slate-50"
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
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-400"
                          >
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
      </div>
    </div>
  );
}
