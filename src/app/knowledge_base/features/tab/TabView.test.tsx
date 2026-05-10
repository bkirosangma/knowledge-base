import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DocumentMeta } from "../document/types";
import type { TabMetadata } from "../../domain/tabEngine";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";
import { FileWatcherProvider } from "../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../shell/ToastContext";
import { PROPERTIES_COLLAPSED_KEY } from "../../shared/constants/paneStorage";

const mountIntoMock = vi.fn();
let mockStatus: string = "idle";
const baseMetadata: TabMetadata = {
  title: "hi",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [],
  sections: [],
  totalBeats: 0,
  durationSeconds: 0,
};
let mockMetadata: TabMetadata | null = null;
let mockError: Error | null = null;

vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,
    session: null,
    score: null,
    mountInto: mountIntoMock,
  }),
}));

vi.mock("../../shared/hooks/useObservedTheme", () => ({
  useObservedTheme: () => "light",
}));

vi.mock("./hooks/useTabPlayback", () => ({
  useTabPlayback: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setTempoFactor: vi.fn(),
    setLoop: vi.fn(),
    setLooping: vi.fn(),
    audioBlocked: false,
    currentTick: 0,
    playerStatus: "paused" as const,
  }),
}));

import { TabView } from "./TabView";

function Wrap({ children, read = vi.fn().mockResolvedValue("\\title \"hi\"\n.") }: {
  children: ReactNode;
  read?: (tabPath: string) => Promise<string>;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, attachmentLinks: null, document: null, diagram: null,
          linkIndex: null, svg: null, svgRefs: null, vaultConfig: null,
          vaultIndex: null,
          tab: { read, write: vi.fn() }, tabRefs: null,
        }}
      >
        <FileWatcherProvider vaultPath={null}>
          <ToastProvider>{children}</ToastProvider>
        </FileWatcherProvider>
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("TabView", () => {
  beforeEach(() => {
    mountIntoMock.mockReset().mockResolvedValue(undefined);
    mockStatus = "idle";
    mockMetadata = null;
    mockError = null;
  });

  it("calls mountInto with the loaded file content", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalled());
    expect(mountIntoMock.mock.calls[0][1]).toBe("\\title \"hi\"\n.");
  });

  it("shows the loading placeholder while status is 'mounting'", async () => {
    mockStatus = "mounting";
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-loading")).toBeInTheDocument();
  });

  it("renders the canvas host when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata };
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("renders the engine-load-error pane with a Reload button", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-engine-error")).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: /reload/i });
    expect(reload).toBeInTheDocument();
  });

  it("Reload button on engine-load-error re-invokes mountInto", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("first attempt failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(mountIntoMock).toHaveBeenCalledTimes(2);
  });

  it("source-parse errors (status='error') route through useShellErrors", async () => {
    const reportError = vi.fn();
    mockStatus = "error";
    mockError = new Error("parse fail");
    render(
      <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
        <StubRepositoryProvider
          value={{
            attachment: null, attachmentLinks: null, document: null, diagram: null,
            linkIndex: null, svg: null, svgRefs: null, vaultConfig: null,
            vaultIndex: null,
            tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() }, tabRefs: null,
          }}
        >
          <FileWatcherProvider vaultPath={null}>
            <ToastProvider>
              <TabView filePath="bad.alphatex" />
            </ToastProvider>
          </FileWatcherProvider>
        </StubRepositoryProvider>
      </StubShellErrorProvider>,
    );
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(reportError.mock.calls[0][0]).toBe(mockError);
    expect(reportError.mock.calls[0][1]).toMatch(/bad\.alphatex/);
  });

  it("mounts the toolbar when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata };
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-toolbar")).toBeInTheDocument();
  });

  it("does not mount the toolbar in engine-load-error state", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.queryByTestId("tab-toolbar")).not.toBeInTheDocument();
  });

  it("mounts the properties panel alongside the canvas when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata };
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
  });

  it("does not mount the properties panel in engine-load-error state", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.queryByTestId("tab-properties")).not.toBeInTheDocument();
  });

  it("hydrates the collapsed state from localStorage on mount", async () => {
    localStorage.setItem(PROPERTIES_COLLAPSED_KEY, "true");
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata };
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-properties")).toHaveAttribute("data-collapsed", "true");
    localStorage.removeItem(PROPERTIES_COLLAPSED_KEY);
  });
});

describe("TabView — DocumentPicker integration", () => {
  beforeEach(() => {
    mountIntoMock.mockReset().mockResolvedValue(undefined);
    mockStatus = "idle";
    mockMetadata = null;
    mockError = null;
    // effectiveReadOnly defaults true (perFileReadOnly=true); seed false so
    // attach buttons render and the DocumentPicker tests can exercise them.
    localStorage.setItem("tab-read-only:tabs/song.alphatex", "false");
  });

  it("opens DocumentPicker when section Attach is clicked, calls onAttachDocument on pick", async () => {
    const onAttachDocument = vi.fn();
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata, sections: [{ name: "Intro", startBeat: 0 }] };
    const user = userEvent.setup();
    render(
      <Wrap>
        <TabView
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onAttachDocument={onAttachDocument}
          getDocumentsForEntity={() => []}
          allDocPaths={["notes/intro-theory.md"]}
        />
      </Wrap>,
    );
    await user.click(screen.getByTestId("attach-section-intro"));
    // DocumentPicker is now mounted — find the document button and click it
    const docButton = await screen.findByRole("button", { name: /intro-theory\.md/i });
    await user.click(docButton);
    expect(onAttachDocument).toHaveBeenCalledWith(
      "notes/intro-theory.md",
      "tab-section",
      "tabs/song.alphatex#intro",
    );
  });

  it("does not render DocumentPicker when onAttachDocument is not provided", async () => {
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata, sections: [{ name: "Intro", startBeat: 0 }] };
    render(
      <Wrap>
        <TabView
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
        />
      </Wrap>,
    );
    // No attach button should be rendered since onAttachDocument is absent
    expect(screen.queryByTestId("attach-section-intro")).not.toBeInTheDocument();
  });
});

describe("TabView — cross-reference plumbing", () => {
  beforeEach(() => {
    mountIntoMock.mockReset().mockResolvedValue(undefined);
    mockStatus = "idle";
    mockMetadata = null;
    mockError = null;
  });

  it("passes filePath, documents, and backlinks through to TabProperties", async () => {
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata, sections: [{ name: "Intro", startBeat: 0 }] };
    render(
      <Wrap>
        <TabView
          filePath="tabs/song.alphatex"
          documents={[
            {
              id: "d1",
              filename: "notes/song-history.md",
              title: "song-history",
              attachedTo: [{ type: "tab", id: "tabs/song.alphatex" }],
            } as DocumentMeta,
          ]}
          backlinks={[]}
        />
      </Wrap>,
    );
    expect(screen.getByText(/whole-file references/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open song-history/i })).toBeInTheDocument();
  });

  it("calls onMigrateAttachments when a section is renamed between metadata snapshots", async () => {
    const onMigrateAttachments = vi.fn();
    mockStatus = "ready";
    mockMetadata = { ...baseMetadata, sections: [{ name: "Verse 1", startBeat: 0 }] };
    const { rerender } = render(
      <Wrap>
        <TabView
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onMigrateAttachments={onMigrateAttachments}
        />
      </Wrap>,
    );
    // First render establishes baseline — no migrations expected.
    expect(onMigrateAttachments).not.toHaveBeenCalled();

    // Simulate the engine emitting a renamed section: produce a fresh
    // metadata object so the useEffect dep change fires.
    mockMetadata = { ...baseMetadata, sections: [{ name: "Verse One", startBeat: 0 }] };
    rerender(
      <Wrap>
        <TabView
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onMigrateAttachments={onMigrateAttachments}
        />
      </Wrap>,
    );

    expect(onMigrateAttachments).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      [{ from: "verse-1", to: "verse-one" }],
    );
  });

  // TAB-11.2-01: TabView lazy-loads the engine module on mount.
  //
  // The case requires that the `@coderline/alphatab` chunk is NOT pulled
  // into the doc/diagram bundle — it should only land via a dynamic
  // `import()` at engine-mount time. The lazy-load is implemented inside
  // `infrastructure/alphaTabEngine.ts::AlphaTabEngine.mount()` (not via
  // `next/dynamic`, which wraps the editor chunk for a different case).
  //
  // Asserting the bundle layout requires a build-time tool
  // (vite-bundle-visualizer); per the plan's Step 3 escape, we verify
  // the source-level invariant here and mark the case 🟡 (manual
  // bundle-size leg). A static import would silently undo this and the
  // assertion below catches it.
  it("TAB-11.2-01: alphaTabEngine module references @coderline/alphatab only via dynamic import (lazy-load)", () => {
    const enginePath = path.resolve(
      __dirname,
      "../../infrastructure/alphaTabEngine.ts",
    );
    const source = fs.readFileSync(enginePath, "utf8");

    // Strip line comments so a JSDoc reference like `* dynamic import()`
    // doesn't pollute the static-import scan.
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");

    // (a) No top-level static import of the alphatab package.
    const staticImport = /^\s*import\s+[^;]*from\s+["']@coderline\/alphatab["']/m;
    expect(code).not.toMatch(staticImport);

    // (b) Dynamic import is present — this is the load-bearing edge that
    //     keeps the chunk out of the doc/diagram bundle.
    expect(code).toMatch(/import\(\s*["']@coderline\/alphatab["']\s*\)/);
  });
});
