/**
 * Verifies that selecting a `.alphatex` file from the explorer opens a
 * `"tab"` pane that renders `TabViewStub`. Foundation-level: TAB-004
 * replaces the stub with the real TabView.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// Bare-shape test that exercises the renderPane mapping logic in
// isolation — full KnowledgeBase mount is too heavyweight here.
import { renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";

describe("tab pane routing", () => {
  it("renders TabViewStub for entries with fileType=\"tab\"", () => {
    render(
      renderTabPaneEntry({
        filePath: "songs/intro.alphatex",
        fileType: "tab",
      })!,
    );
    expect(screen.getByTestId("tab-view-stub")).toBeInTheDocument();
    expect(screen.getByText(/songs\/intro\.alphatex/)).toBeInTheDocument();
  });

  it("returns null for non-tab fileType", () => {
    expect(
      renderTabPaneEntry({
        filePath: "x.md",
        fileType: "document",
      }),
    ).toBeNull();
  });
});
