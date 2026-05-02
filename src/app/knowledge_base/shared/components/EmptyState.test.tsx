// Covers SHELL-1.6-13, 1.6-14, 1.6-15 (KB-045 useful empty state).
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EmptyState, { EMPTY_STATE_SHORTCUTS } from "./EmptyState";

afterEach(() => cleanup());

describe("EmptyState (KB-045)", () => {
  it("SHELL-1.6-13: renders the canonical 5 shortcut chips (⌘K, ⌘N, ⌘S, ⌘., ⌘\\)", () => {
    render(
      <EmptyState
        recents={[]}
        onSelectRecent={() => {}}
        onCreateNote={() => {}}
      />,
    );
    expect(EMPTY_STATE_SHORTCUTS.map((s) => s.combo)).toEqual([
      "⌘K",
      "⌘N",
      "⌘S",
      "⌘.",
      "⌘\\",
    ]);
    for (const s of EMPTY_STATE_SHORTCUTS) {
      expect(screen.getByText(s.combo)).toBeTruthy();
    }
  });

  it("SHELL-1.6-14: lists up to 5 recents and routes clicks back through onSelectRecent", async () => {
    const onSelect = vi.fn();
    const recents = [
      "notes/one.md",
      "notes/two.md",
      "diagrams/three.json",
      "notes/four.md",
      "notes/five.md",
      "notes/six.md", // beyond the 5-item slice
    ];
    render(
      <EmptyState
        recents={recents}
        onSelectRecent={onSelect}
        onCreateNote={() => {}}
      />,
    );
    const items = screen.getAllByTestId(/^empty-state-recent-/);
    expect(items).toHaveLength(5);
    expect(screen.queryByText("six.md")).toBeNull();
    await userEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledWith("notes/one.md");
  });

  it("renders an empty-recents hint when there are no recents", () => {
    render(
      <EmptyState
        recents={[]}
        onSelectRecent={() => {}}
        onCreateNote={() => {}}
      />,
    );
    expect(screen.getByTestId("empty-state-recents-empty")).toBeTruthy();
    expect(screen.queryByTestId(/^empty-state-recent-/)).toBeNull();
  });

  it("SHELL-1.6-15: 'New Note' button fires onCreateNote", async () => {
    const onCreateNote = vi.fn();
    render(
      <EmptyState
        recents={[]}
        onSelectRecent={() => {}}
        onCreateNote={onCreateNote}
      />,
    );
    await userEvent.click(screen.getByTestId("empty-state-new-note"));
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });

  it("recent labels strip directories and the .md extension for readability", () => {
    render(
      <EmptyState
        recents={["docs/architecture/Cluster Overview.md", "diagrams/flow.json"]}
        onSelectRecent={() => {}}
        onCreateNote={() => {}}
      />,
    );
    expect(screen.getByText("Cluster Overview")).toBeTruthy();
    // .json keeps its extension so users can tell file-types apart.
    expect(screen.getByText("flow.json")).toBeTruthy();
  });
});
