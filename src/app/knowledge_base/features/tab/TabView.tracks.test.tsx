/**
 * TAB-009 T26 — TabView wires all multi-track props.
 *
 * Created as a separate file from TabView.muteSolo.test.tsx because:
 * - These tests need readOnly=false so the TabEditor mounts and
 *   registers its apply fn (the dispatch path for track CRUD).
 * - The muteSolo file uses readOnly=true by design (it only needs the panel).
 *
 * Strategy: capture the `applyFn` that TabView passes to TabEditor via
 * registerApply, then assert on it. This verifies the full
 * TabProperties → handleAddTrack/etc → propertiesApply → editorApplyRef.current
 * wiring without needing a real AlphaTab engine.
 */
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";
import { TabView } from "./TabView";
import type { TabViewProps } from "./TabView";
import type { TabMetadata } from "../../domain/tabEngine";
import type { TabEditOp } from "../../domain/tabEngine";
import type { AttachmentLink } from "../../domain/attachmentLinks";

// ── Capture the apply fn registered by TabEditor ──────────────────────────
// vi.hoisted lets us share the spy between the mock factory and the test body.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { applySpy } = vi.hoisted(() => ({ applySpy: vi.fn<(...args: any[]) => void>() }));

vi.mock("./editor/TabEditor", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ registerApply }: { registerApply?: (fn: (op: any) => void) => void }) => {
    // Register the hoisted spy so TabView's editorApplyRef points to it.
    registerApply?.(applySpy);
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

// ── Mutable stubs — tests assign per-test ─────────────────────────────────
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
describe("TabView multi-track prop wiring (TAB-009 T26)", () => {
  beforeEach(() => {
    localStorage.clear();
    // useReadOnlyState defaults perFileReadOnly=true. Set it to false so
    // effectiveReadOnly=false and TabEditor mounts (needed for registerApply to fire).
    localStorage.setItem("tab-read-only:song.alphatex", "false");
    applySpy.mockClear();
    mockSession = {
      setPlaybackState: vi.fn(),
      render: vi.fn(),
    };
    mockMetadata = makeTwoTrackMetadata();
  });

  it("activeTrackIndex defaults to 0 before cursor is set — Lead row shows active dot filled (TAB-009 T26)", async () => {
    render(
      <Wrap>
        {/* readOnly=false so TabEditor mounts and properties panel shows */}
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // Track 0 (Lead) should have its active dot filled (data-filled="true").
    // Track 1 (Bass) should have data-filled="false".
    // The active dots are siblings of the track name text within each list item.
    await screen.findByText("Lead"); // wait for metadata to render

    const dots = document.querySelectorAll("[data-active-dot]");
    expect(dots.length).toBe(2);
    expect(dots[0].getAttribute("data-filled")).toBe("true");
    expect(dots[1].getAttribute("data-filled")).toBe("false");
  });

  it("clicking '+ Add track' → typing a name → clicking Save dispatches add-track via editorApplyRef (TAB-009 T26)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // Open the add-track form.
    const addBtn = await screen.findByText("+ Add track");
    fireEvent.click(addBtn);

    // Type a name.
    const nameInput = await screen.findByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Rhythm" } });

    // Click Save.
    const saveBtn = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "add-track",
          name: "Rhythm",
          instrument: "guitar",
        }),
      );
    });
  });

  it("clicking a track row sets cursor.trackIndex → Bass active dot becomes filled (TAB-009 T26)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // Initially Lead (index 0) is active.
    await screen.findByText("Lead");
    const dotsBefore = document.querySelectorAll("[data-active-dot]");
    expect(dotsBefore[0].getAttribute("data-filled")).toBe("true");
    expect(dotsBefore[1].getAttribute("data-filled")).toBe("false");

    // Click the Bass row — this fires onSwitchActiveTrack(1) → setCursor({ trackIndex: 1, ... }).
    const bassRow = screen.getByText("Bass");
    fireEvent.click(bassRow);

    // After click, trackIndex=1 → Bass dot should be filled, Lead dot should not.
    await waitFor(() => {
      const dots = document.querySelectorAll("[data-active-dot]");
      expect(dots[0].getAttribute("data-filled")).toBe("false");
      expect(dots[1].getAttribute("data-filled")).toBe("true");
    });
  });

  it("set-track-capo input blur dispatches via propertiesApply (TAB-009 T26)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // The TrackEditor is shown for the active track (index 0 = Lead).
    // The capo input has aria-label="Capo".
    const capoInput = await screen.findByLabelText("Capo");
    fireEvent.blur(capoInput, { target: { value: "3" } });

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "set-track-capo",
          trackId: "0",
          fret: 3,
        }),
      );
    });
  });

  it("set-track-tuning string blur dispatches via propertiesApply (TAB-009 T26)", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // String 1 input has aria-label="String 1"
    const string1Input = await screen.findByLabelText("String 1");
    fireEvent.blur(string1Input, { target: { value: "D2" } });

    await waitFor(() => {
      // Find the call with type "set-track-tuning" and verify tuning[0] was updated.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls: any[] = applySpy.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tuningCall = calls.find((args: any[]) => args[0]?.type === "set-track-tuning");
      expect(tuningCall).toBeDefined();
      expect(tuningCall[0].trackId).toBe("0");
      expect(tuningCall[0].tuning[0]).toBe("D2");
    });
  });

  it("removing track via kebab menu dispatches remove-track and cursor snaps to track 0 (TAB-009 T26)", async () => {
    // Mock window.confirm to return true so the remove dialog is accepted.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <Wrap>
        <TabView filePath="song.alphatex" readOnly={false} />
      </Wrap>,
    );

    // First, click Bass row to make track index 1 the active track.
    await screen.findByText("Lead");
    fireEvent.click(screen.getByText("Bass"));
    await waitFor(() => {
      const dots = document.querySelectorAll("[data-active-dot]");
      expect(dots[1].getAttribute("data-filled")).toBe("true");
    });

    // Open the kebab menu for Lead (track 0).
    const kebabBtn = screen.getByLabelText("Track menu Lead");
    act(() => { fireEvent.click(kebabBtn); });

    // Click "Remove track".
    const removeBtn = await screen.findByRole("menuitem", { name: "Remove track" });
    act(() => { fireEvent.click(removeBtn); });

    // Verify dispatch.
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "remove-track",
          trackId: "0",
        }),
      );
    });

    // Verify cursor snapped back to track 0 (Lead dot should be filled again
    // since the cursor was reset to trackIndex=0, regardless of which track was active).
    await waitFor(() => {
      const dots = document.querySelectorAll("[data-active-dot]");
      // After reset, trackIndex=0 is active again.
      expect(dots[0].getAttribute("data-filled")).toBe("true");
    });

    confirmSpy.mockRestore();
  });
});

// ── T15: detach tab-track rows on remove-track ────────────────────────────

describe("TabView.handleRemoveTrack attachment cleanup (TAB-011 T15)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tab-read-only:song.alphatex", "false");
    applySpy.mockClear();
    mockSession = {
      setPlaybackState: vi.fn(),
      render: vi.fn(),
    };
    mockMetadata = makeTwoTrackMetadata();
  });

  it("TAB-11.10-01: handleRemoveTrack detaches tab-track rows for the removed track's UUID before the engine splice", async () => {
    const detachAttachmentsFor = vi.fn((_matcher: (r: AttachmentLink) => boolean) => ({ detached: 1 }));
    const withBatch = vi.fn(async <T,>(fn: () => Promise<T> | T): Promise<T> => fn()) as NonNullable<TabViewProps["withBatch"]>;
    const tabRefsRead = vi.fn().mockResolvedValue({
      version: 2,
      sectionRefs: {},
      trackRefs: [
        { id: "uuid-A" },
        { id: "uuid-B" },
      ],
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
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
            tabRefs: { read: tabRefsRead, write: vi.fn().mockResolvedValue(undefined) },
          }}
        >
          <TabView
            filePath="song.alphatex"
            readOnly={false}
            detachAttachmentsFor={detachAttachmentsFor}
            withBatch={withBatch}
          />
        </StubRepositoryProvider>
      </StubShellErrorProvider>,
    );

    // Open the kebab menu for Lead (track 0) and remove it.
    await screen.findByText("Lead");
    const kebabBtn = screen.getByLabelText("Track menu Lead");
    act(() => { fireEvent.click(kebabBtn); });
    const removeBtn = await screen.findByRole("menuitem", { name: "Remove track" });
    act(() => { fireEvent.click(removeBtn); });

    // Wait for the engine splice (propertiesApply) to fire, which happens AFTER detach.
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "remove-track", trackId: "0" }),
      );
    });

    // detachAttachmentsFor must have been called.
    expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);
    // withBatch must have been called to wrap the detach.
    expect(withBatch).toHaveBeenCalledTimes(1);

    // Extract the matcher and verify it is correctly scoped to the removed track's UUID.
    // detachAttachmentsFor was called at least once (asserted above) so index 0 is safe.
    const capturedMatcher = detachAttachmentsFor.mock.calls[0]?.[0];
    expect(capturedMatcher).toBeDefined();
    const matcher = capturedMatcher!;
    const makeRow = (entityType: AttachmentLink["entityType"] | string, entityId: string): AttachmentLink =>
      ({ docPath: "doc.md", entityType: entityType as AttachmentLink["entityType"], entityId });
    // Matches the exact track entity.
    expect(matcher(makeRow("tab-track", "song.alphatex#track:uuid-A"))).toBe(true);
    // Does NOT match the surviving track (different UUID).
    expect(matcher(makeRow("tab-track", "song.alphatex#track:uuid-B"))).toBe(false);
    // Does NOT match the parent tab entity.
    expect(matcher(makeRow("tab", "song.alphatex"))).toBe(false);

    confirmSpy.mockRestore();
  });

  it("TAB-11.10-02: handleRemoveTrack with absent sidecar skips detach but still splices the engine", async () => {
    const detachAttachmentsFor = vi.fn((_matcher: (r: AttachmentLink) => boolean) => ({ detached: 0 }));
    const withBatch = vi.fn(async <T,>(fn: () => Promise<T> | T): Promise<T> => fn()) as NonNullable<TabViewProps["withBatch"]>;
    const tabRefsRead = vi.fn().mockResolvedValue(null); // no sidecar for this file

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
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
            tabRefs: { read: tabRefsRead, write: vi.fn().mockResolvedValue(undefined) },
          }}
        >
          <TabView
            filePath="song.alphatex"
            readOnly={false}
            detachAttachmentsFor={detachAttachmentsFor}
            withBatch={withBatch}
          />
        </StubRepositoryProvider>
      </StubShellErrorProvider>,
    );

    // Remove Lead (track 0) — sidecar returns null so no UUID, no detach.
    await screen.findByText("Lead");
    const kebabBtn = screen.getByLabelText("Track menu Lead");
    act(() => { fireEvent.click(kebabBtn); });
    const removeBtn = await screen.findByRole("menuitem", { name: "Remove track" });
    act(() => { fireEvent.click(removeBtn); });

    // Engine splice must still happen.
    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "remove-track", trackId: "0" }),
      );
    });

    // detachAttachmentsFor must NOT have been called — no UUID was found.
    expect(detachAttachmentsFor).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
