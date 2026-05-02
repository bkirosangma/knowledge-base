import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GraphPlaceholder from "./GraphPlaceholder";

afterEach(() => cleanup());

describe("GraphPlaceholder", () => {
  it("reports the current node count and the threshold in the message", () => {
    render(
      <GraphPlaceholder
        nodeCount={812}
        threshold={300}
        onShowRecentOnly={() => {}}
        onRenderAnyway={() => {}}
      />,
    );
    const placeholder = screen.getByTestId("graph-guard-placeholder");
    expect(placeholder.textContent).toMatch(/812/);
    expect(placeholder.textContent).toMatch(/300/);
  });

  it("renders the recent-only and render-anyway quick actions", () => {
    render(
      <GraphPlaceholder
        nodeCount={500}
        threshold={300}
        onShowRecentOnly={() => {}}
        onRenderAnyway={() => {}}
      />,
    );
    expect(screen.getByTestId("graph-guard-recent-only")).toBeTruthy();
    expect(screen.getByTestId("graph-guard-render-anyway")).toBeTruthy();
  });

  it("fires onShowRecentOnly when the recent-only button is clicked", async () => {
    const onShowRecentOnly = vi.fn();
    render(
      <GraphPlaceholder
        nodeCount={500}
        threshold={300}
        onShowRecentOnly={onShowRecentOnly}
        onRenderAnyway={() => {}}
      />,
    );
    await userEvent.click(screen.getByTestId("graph-guard-recent-only"));
    expect(onShowRecentOnly).toHaveBeenCalledTimes(1);
  });

  it("fires onRenderAnyway when the render-anyway button is clicked", async () => {
    const onRenderAnyway = vi.fn();
    render(
      <GraphPlaceholder
        nodeCount={500}
        threshold={300}
        onShowRecentOnly={() => {}}
        onRenderAnyway={onRenderAnyway}
      />,
    );
    await userEvent.click(screen.getByTestId("graph-guard-render-anyway"));
    expect(onRenderAnyway).toHaveBeenCalledTimes(1);
  });
});
