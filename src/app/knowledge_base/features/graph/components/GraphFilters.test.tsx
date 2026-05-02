import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GraphFilters from "./GraphFilters";
import type { GraphFilters as FiltersState } from "../hooks/useGraphData";

afterEach(() => cleanup());

const baseFilters: FiltersState = {
  folders: null,
  fileTypes: new Set(["md", "json"]),
  orphansOnly: false,
  recentOnly: false,
};

describe("GraphFilters — recent-only toggle (KB-042)", () => {
  it("renders the recent-only checkbox alongside orphans-only", () => {
    render(
      <GraphFilters allFolders={[""]} filters={baseFilters} onChange={() => {}} />,
    );
    expect(screen.getByTestId("graph-filter-recent-only")).toBeTruthy();
  });

  it("flips recentOnly via onChange when clicked", async () => {
    const onChange = vi.fn();
    render(
      <GraphFilters allFolders={[""]} filters={baseFilters} onChange={onChange} />,
    );
    await userEvent.click(screen.getByTestId("graph-filter-recent-only"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ recentOnly: true });
  });
});
