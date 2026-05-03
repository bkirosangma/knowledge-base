import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";
import { TabView } from "./TabView";

// Stub the lazy-loaded editor chunk so JSDOM doesn't need the real module.
// The stub accepts all props from TabEditorProps (including C3 cursor props).
vi.mock("./editor/TabEditor", () => ({
  default: ({
    filePath,
    registerApply,
    setCursor,
  }: {
    filePath: string;
    session?: unknown;
    score?: unknown;
    metadata?: unknown;
    onScoreChange?: unknown;
    cursor?: unknown;
    setCursor?: (loc: unknown) => void;
    clearCursor?: () => void;
    moveBeat?: (d: 1 | -1) => void;
    moveString?: (d: 1 | -1) => void;
    moveBar?: (d: 1 | -1) => void;
    registerApply?: (fn: (op: unknown) => void) => void;
    onApplyEdit?: (op: unknown) => void;
  }) => {
    // Expose a test handle so C3 tests can trigger registerApply and setCursor.
    if (registerApply) registerApply((_op: unknown) => {});
    return (
      <div
        data-testid="tab-editor"
        data-filepath={filePath}
        onClick={() => setCursor?.({ trackIndex: 0, beat: 0, string: 6 })}
      />
    );
  },
}));

vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: "idle",
    metadata: null,
    error: null,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,
    session: null,
    score: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
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
    audioBlocked: false,
    currentTick: 0,
    playerStatus: "paused" as const,
  }),
}));

function Wrap({
  children,
  read = vi.fn().mockResolvedValue('\\title "hi"\n.'),
}: {
  children: ReactNode;
  read?: (tabPath: string) => Promise<string>;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null,
          document: null,
          diagram: null,
          linkIndex: null,
          svg: null,
          vaultConfig: null,
          tab: { read, write: vi.fn() },
          tabRefs: null,
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("TabView editor chunk gate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not load TabEditor when paneReadOnly=true (mobile)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={true} />
      </Wrap>,
    );
    await waitFor(() => {});
    expect(screen.queryByTestId("tab-editor")).toBeNull();
  });

  it("does not load TabEditor when perFileReadOnly=true (default, no localStorage)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );
    await waitFor(() => {});
    // useReadOnlyState defaults perFileReadOnly to true, so editor stays gated
    expect(screen.queryByTestId("tab-editor")).toBeNull();
  });

  it("loads TabEditor when both readOnly flags are false", async () => {
    localStorage.setItem("tab-read-only:song.alphatex", "false");
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );
    expect(await screen.findByTestId("tab-editor")).toBeInTheDocument();
  });

  it("does not load TabEditor when filePath is null", async () => {
    render(
      <Wrap>
        <TabView filePath={null as unknown as string} readOnly={false} />
      </Wrap>,
    );
    await waitFor(() => {});
    expect(screen.queryByTestId("tab-editor")).toBeNull();
  });

  it("TAB-012-06: clicking Edit toggle loads the editor chunk", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );
    // perFileReadOnly defaults to true so editor is initially hidden
    await waitFor(() => {});
    expect(screen.queryByTestId("tab-editor")).toBeNull();
    // Click the Edit toggle — TabView's single useTabEditMode toggles effectiveReadOnly
    fireEvent.click(screen.getByRole("button", { name: /edit tab/i }));
    expect(await screen.findByTestId("tab-editor")).toBeInTheDocument();
  });

  it("C3: TabProperties is always rendered (not gated on editor mount)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={true} />
      </Wrap>,
    );
    await waitFor(() => {});
    // TabProperties renders even in read-only mode (no editor).
    expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
    // Editor is absent.
    expect(screen.queryByTestId("tab-editor")).toBeNull();
  });

  it("C3: TabView passes cursor state to TabProperties (selectedNoteDetails section hidden when no cursor)", async () => {
    // With metadata=null and no cursor, TabProperties should not show SelectedNoteDetails.
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );
    await waitFor(() => {});
    // The "Selected note" heading only renders when selectedNoteDetails != null AND !readOnly.
    // With null metadata + no cursor, selectedNoteDetails=null, so section is absent.
    expect(screen.queryByRole("heading", { name: /selected note/i })).toBeNull();
  });
});
