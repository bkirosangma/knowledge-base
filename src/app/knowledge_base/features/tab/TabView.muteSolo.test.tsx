/**
 * TAB-009 T25 — TabView mute/solo state + setPlaybackState wiring.
 *
 * Created as a separate file (TabView.muteSolo.test.tsx) rather than extending
 * TabView.editor.test.tsx because the existing test file stubs useTabEngine to
 * return { session: null, metadata: null }, but T25 tests require a non-null
 * session (to receive setPlaybackState calls) and non-null metadata with
 * multi-track entries (so TabProperties renders the M/S buttons).  Mutating
 * the existing mock would risk breaking C2/C3 tests.
 */
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";
import { TabView } from "./TabView";
import type { TabMetadata } from "../../domain/tabEngine";

// ── Stub the lazy-loaded editor so JSDOM doesn't need the real module ──────
vi.mock("./editor/TabEditor", () => ({
  default: ({
    registerApply,
  }: {
    registerApply?: (fn: (op: unknown) => void) => void;
  }) => {
    if (registerApply) registerApply((_op: unknown) => {});
    return <div data-testid="tab-editor" />;
  },
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

// ── Mutable session stub — tests can swap it per-test ─────────────────────
let mockSession: {
  setPlaybackState: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} | null = null;

let mockMetadata: TabMetadata | null = null;

vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockMetadata ? "ready" : "idle",
    metadata: mockMetadata,
    error: null,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,
    session: mockSession,
    score: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ── Helper: two-track metadata ─────────────────────────────────────────────
function makeTwoTrackMetadata(): TabMetadata {
  return {
    title: "Test Tab",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [
      { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
      { id: "1", name: "Bass", instrument: "bass",  tuning: ["B0", "E1", "A1", "D2"],              capo: 0 },
    ],
    sections: [],
    totalBeats: 8,
    durationSeconds: 16,
  };
}

// ── Test wrapper ───────────────────────────────────────────────────────────
function Wrap({ children }: { children: ReactNode }) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, attachmentLinks: null,
          document: null,
          diagram: null,
          linkIndex: null,
          svg: null,
          vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue('\\title "Test Tab"\n.'), write: vi.fn() },
          tabRefs: null,
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("TabView mute/solo state + setPlaybackState wiring (TAB-009 T25)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Each test gets fresh mocks; default to multi-track, non-null session.
    mockSession = {
      setPlaybackState: vi.fn(),
      render: vi.fn(),
    };
    mockMetadata = makeTwoTrackMetadata();
  });

  it("clicking mute on a track calls session.setPlaybackState with that track id (TAB-009 T25)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={true} />
      </Wrap>,
    );

    // Wait for TabProperties + Tracks section to be visible.
    const muteBtn = await screen.findByLabelText("Mute Lead");

    // Clear the initial mount call(s) so we can assert the post-click call cleanly.
    mockSession!.setPlaybackState.mockClear();

    fireEvent.click(muteBtn);

    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: ["0"],
        soloedTrackIds: [],
      });
    });
  });

  it("clicking solo on a track calls session.setPlaybackState with that track id (TAB-009 T25)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={true} />
      </Wrap>,
    );

    const soloBtn = await screen.findByLabelText("Solo Lead");

    mockSession!.setPlaybackState.mockClear();
    fireEvent.click(soloBtn);

    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: [],
        soloedTrackIds: ["0"],
      });
    });
  });

  it("toggling mute twice removes the track from mutedTrackIds (TAB-009 T25)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={true} />
      </Wrap>,
    );

    const muteBtn = await screen.findByLabelText("Mute Lead");

    // First click — add to muted.
    fireEvent.click(muteBtn);
    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: ["0"],
        soloedTrackIds: [],
      });
    });

    // Second click — remove from muted.
    fireEvent.click(muteBtn);
    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: [],
        soloedTrackIds: [],
      });
    });
  });

  it("mute state resets when filePath changes (TAB-009 T25)", async () => {
    const { rerender } = render(
      <Wrap>
        <TabView filePath="a.alphatex" readOnly={true} />
      </Wrap>,
    );

    // Mute track 0.
    const muteBtn = await screen.findByLabelText("Mute Lead");
    fireEvent.click(muteBtn);
    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: ["0"],
        soloedTrackIds: [],
      });
    });

    // Change filePath — state should reset.
    mockSession!.setPlaybackState.mockClear();
    act(() => {
      rerender(
        <Wrap>
          <TabView filePath="b.alphatex" readOnly={true} />
        </Wrap>,
      );
    });

    await waitFor(() => {
      expect(mockSession!.setPlaybackState).toHaveBeenLastCalledWith({
        mutedTrackIds: [],
        soloedTrackIds: [],
      });
    });
  });
});
