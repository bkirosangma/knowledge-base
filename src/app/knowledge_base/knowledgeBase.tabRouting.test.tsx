import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "./shell/RepositoryContext";
import { StubShellErrorProvider } from "./shell/ShellErrorContext";
import { buildTabPaneContext, renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";

vi.mock("./features/tab/hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: "ready",
    metadata: null,
    error: null,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: false,
    session: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
  }),
}));

function wrap(children: ReactNode) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() },
          tabRefs: null,
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("tab pane routing", () => {
  it("renders TabView with the file path for entries with fileType=\"tab\"", () => {
    render(wrap(renderTabPaneEntry({ filePath: "songs/intro.alphatex", fileType: "tab" })!));
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("returns null for non-tab fileType", () => {
    expect(
      renderTabPaneEntry({ filePath: "x.md", fileType: "document" }),
    ).toBeNull();
  });
});

describe("buildTabPaneContext (TAB-012 T1)", () => {
  // Stable stubs so every assertion below has the same callable shape.
  const stubs = {
    documents: [],
    backlinks: [],
    onPreviewDocument: vi.fn(),
    onAttachDocument: vi.fn(),
    onDetachDocument: vi.fn(),
    onCreateDocument: vi.fn().mockResolvedValue(undefined),
    getDocumentsForEntity: vi.fn(() => []),
    allDocPaths: [] as string[],
    rootHandle: null,
    onMigrateAttachments: vi.fn(),
  };

  it("TAB-11.8-01: sets readOnly: true when isMobile is true (KB-040 mobile stance)", () => {
    const ctx = buildTabPaneContext({ ...stubs, isMobile: true });
    expect(ctx.readOnly).toBe(true);
  });

  it("TAB-11.8-02: sets readOnly: false when isMobile is false (desktop)", () => {
    const ctx = buildTabPaneContext({ ...stubs, isMobile: false });
    expect(ctx.readOnly).toBe(false);
  });

  it("passes through documents, backlinks, and callbacks unchanged", () => {
    const docs = [{ id: "d1", filename: "n.md", title: "n", attachedTo: [] }];
    const bls = [{ sourcePath: "a.md" }];
    const ctx = buildTabPaneContext({
      ...stubs,
      documents: docs,
      backlinks: bls,
      isMobile: false,
    });
    expect(ctx.documents).toBe(docs);
    expect(ctx.backlinks).toBe(bls);
    expect(ctx.onAttachDocument).toBe(stubs.onAttachDocument);
    expect(ctx.onDetachDocument).toBe(stubs.onDetachDocument);
    expect(ctx.onPreviewDocument).toBe(stubs.onPreviewDocument);
    expect(ctx.onCreateDocument).toBe(stubs.onCreateDocument);
    expect(ctx.getDocumentsForEntity).toBe(stubs.getDocumentsForEntity);
    expect(ctx.onMigrateAttachments).toBe(stubs.onMigrateAttachments);
  });
});
