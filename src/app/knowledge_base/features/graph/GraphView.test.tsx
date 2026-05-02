import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GraphView from "./GraphView";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import type { Repositories } from "../../shell/RepositoryContext";
import type { TreeNode } from "../../shared/utils/fileTree";
import type { LinkIndex } from "../document/types";

// Stub the lazy-loaded canvas so JSDOM doesn't try to import
// `react-force-graph-2d` (which touches `window` at import time).
vi.mock("./components/GraphCanvas", () => ({
  default: () => <div data-testid="graph-canvas" />,
}));

afterEach(() => cleanup());

function makeTree(count: number): TreeNode[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `note-${String(i).padStart(4, "0")}.md`,
    path: `note-${String(i).padStart(4, "0")}.md`,
    type: "file" as const,
    fileType: "document" as const,
    lastModified: 1_000 + i,
  }));
}

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

function stubRepos(): Repositories {
  // Only the bits GraphView actually touches need to exist; the rest are
  // present so `useRepositories()` doesn't throw inside descendant hooks.
  return {
    activeRoot: null,
    vaultConfig: null,
    documentRepository: null,
    diagramRepository: null,
    linkIndexRepository: null,
    historyRepository: null,
    snapshotRepository: null,
  } as unknown as Repositories;
}

function renderGraph(tree: TreeNode[]) {
  return render(
    <StubRepositoryProvider value={stubRepos()}>
      <GraphView
        focused
        tree={tree}
        linkIndex={emptyIndex()}
        onSelectNode={() => {}}
      />
    </StubRepositoryProvider>,
  );
}

describe("GraphView — KB-042 node-count guard", () => {
  it("GRAPH-5.4-14: shows the placeholder when node count exceeds the threshold", async () => {
    renderGraph(makeTree(350));
    expect(await screen.findByTestId("graph-guard-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("graph-canvas")).toBeNull();
  });

  it("renders the canvas when node count is at or below the threshold", async () => {
    renderGraph(makeTree(50));
    await waitFor(() => {
      expect(screen.getByTestId("graph-canvas")).toBeTruthy();
    });
    expect(screen.queryByTestId("graph-guard-placeholder")).toBeNull();
  });

  it("GRAPH-5.4-15: 'Render anyway' mounts the canvas even with > 300 nodes", async () => {
    renderGraph(makeTree(350));
    await screen.findByTestId("graph-guard-placeholder");
    await userEvent.click(screen.getByTestId("graph-guard-render-anyway"));
    await waitFor(() => {
      expect(screen.getByTestId("graph-canvas")).toBeTruthy();
    });
    expect(screen.queryByTestId("graph-guard-placeholder")).toBeNull();
  });

  it("GRAPH-5.4-16: 'Show recent only' narrows the set so the canvas mounts", async () => {
    renderGraph(makeTree(350));
    await screen.findByTestId("graph-guard-placeholder");
    await userEvent.click(screen.getByTestId("graph-guard-recent-only"));
    await waitFor(() => {
      expect(screen.getByTestId("graph-canvas")).toBeTruthy();
    });
    expect(screen.queryByTestId("graph-guard-placeholder")).toBeNull();
  });
});
