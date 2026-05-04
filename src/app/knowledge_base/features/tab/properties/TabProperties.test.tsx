import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import type { TabMetadata } from "../../../domain/tabEngine";
import type { DocumentMeta } from "../../document/types";
import { TabProperties } from "./TabProperties";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";

/**
 * Wrap renders in a minimal RepositoryProvider so the Sections sub-component
 * (which now calls useRepositories() for sidecar reads) doesn't throw.
 */
function Wrap({ children, tabRefs = null }: { children: ReactNode; tabRefs?: Parameters<typeof StubRepositoryProvider>[0]["value"]["tabRefs"] }) {
  return (
    <StubRepositoryProvider
      value={{
        attachment: null,
        document: null,
        diagram: null,
        linkIndex: null,
        svg: null,
        vaultConfig: null,
        tab: null,
        tabRefs,
      }}
    >
      {children}
    </StubRepositoryProvider>
  );
}

function makeMetadata(overrides: Partial<TabMetadata> = {}): TabMetadata {
  return {
    title: "Intro Riff",
    artist: "Demo",
    subtitle: "Practice",
    tempo: 120,
    key: "Gmaj",
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [{ id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 2 }],
    sections: [
      { name: "Intro", startBeat: 0 },
      { name: "Verse 1", startBeat: 1920 },
    ],
    totalBeats: 7680,
    durationSeconds: 30,
    ...overrides,
  };
}

describe("TabProperties", () => {
  it("renders the title, artist, and subtitle from metadata", () => {
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Practice")).toBeInTheDocument();
  });

  it("renders tempo, key, time signature, capo, and tuning", () => {
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("Gmaj")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
    expect(screen.getByText("Capo 2")).toBeInTheDocument();
    expect(screen.getByText("E2 A2 D3 G3 B3 E4")).toBeInTheDocument();
  });

  it("renders the section list with names and start beats", () => {
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Verse 1")).toBeInTheDocument();
    // Start beat shown alongside the section name (visually small).
    expect(screen.getByText(/beat 0/i)).toBeInTheDocument();
    expect(screen.getByText(/beat 1920/i)).toBeInTheDocument();
  });

  it("renders the track names", () => {
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText("Guitar")).toBeInTheDocument();
  });

  it("hides full content and shows the collapsed chrome when collapsed=true", () => {
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={true} onToggleCollapse={vi.fn()} /></Wrap>);
    // The panel is still mounted (for slide animation); just narrowed.
    expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
    expect(screen.getByTestId("tab-properties")).toHaveAttribute("data-collapsed", "true");
    // Content fields should NOT be visible.
    expect(screen.queryByText("120 BPM")).not.toBeInTheDocument();
  });

  it("toggle button calls onToggleCollapse when clicked", async () => {
    const onToggleCollapse = vi.fn();
    render(<Wrap><TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={onToggleCollapse} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: /collapse properties|expand properties/i }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders a placeholder when metadata is null (pre-load state)", () => {
    render(<Wrap><TabProperties metadata={null} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText(/loading score/i)).toBeInTheDocument();
  });

  it("omits optional fields when absent (artist, subtitle, key)", () => {
    const md = makeMetadata({ artist: undefined, subtitle: undefined, key: undefined });
    render(<Wrap><TabProperties metadata={md} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Practice")).not.toBeInTheDocument();
    expect(screen.queryByText("Gmaj")).not.toBeInTheDocument();
    // Title still renders.
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
  });

  it("renders track rows with names (TAB-009 T16)", () => {
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    render(<Wrap><TabProperties metadata={metadata} collapsed={false} onToggleCollapse={vi.fn()} /></Wrap>);
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Bass")).toBeInTheDocument();
  });

  it("clicking a track row fires onSwitchActiveTrack with that track's index", async () => {
    const onSwitch = vi.fn();
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    render(
      <Wrap>
        <TabProperties
          metadata={metadata}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
        />
      </Wrap>,
    );
    const bassRow = screen.getByText("Bass").closest("[data-track-row]") as HTMLElement;
    fireEvent.click(bassRow);
    expect(onSwitch).toHaveBeenCalledWith(1);
  });

  it("active row has 3 visual signals: accent border-l, bold name, filled dot", () => {
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    const { container } = render(
      <Wrap>
        <TabProperties metadata={metadata} collapsed={false} onToggleCollapse={vi.fn()} activeTrackIndex={0} />
      </Wrap>,
    );
    const leadRow = screen.getByText("Lead").closest("[data-track-row]");
    expect(leadRow?.className).toMatch(/border-l-accent/);
    expect(leadRow?.className).toMatch(/font-semibold/);
    const leadDot = leadRow?.querySelector("[data-active-dot]");
    expect(leadDot?.getAttribute("data-filled")).toBe("true");

    const bassRow = screen.getByText("Bass").closest("[data-track-row]");
    expect(bassRow?.className).toMatch(/border-l-transparent/);
    const bassDot = bassRow?.querySelector("[data-active-dot]");
    expect(bassDot?.getAttribute("data-filled")).toBe("false");
  });

  it("Enter on a track row activates onSwitchActiveTrack", () => {
    const onSwitch = vi.fn();
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    render(
      <Wrap>
        <TabProperties
          metadata={metadata}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
        />
      </Wrap>,
    );
    const bassRow = screen.getByText("Bass").closest("[data-track-row]") as HTMLElement;
    fireEvent.keyDown(bassRow, { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledWith(1);
  });

  it("Space on a track row activates onSwitchActiveTrack", () => {
    const onSwitch = vi.fn();
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    render(
      <Wrap>
        <TabProperties
          metadata={metadata}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
        />
      </Wrap>,
    );
    const bassRow = screen.getByText("Bass").closest("[data-track-row]") as HTMLElement;
    fireEvent.keyDown(bassRow, { key: " " });
    expect(onSwitch).toHaveBeenCalledWith(1);
  });

  it("clicking a row when onSwitchActiveTrack is undefined is a no-op (no throw)", () => {
    const metadata = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    render(
      <Wrap>
        <TabProperties metadata={metadata} collapsed={false} onToggleCollapse={vi.fn()} activeTrackIndex={0} />
      </Wrap>,
    );
    expect(() => fireEvent.click(screen.getByText("Bass"))).not.toThrow();
  });
});

describe("TabProperties — cross-references", () => {
  const baseDocs: DocumentMeta[] = [
    {
      id: "d1",
      filename: "notes/song-history.md",
      title: "song-history",
      attachedTo: [{ type: "tab", id: "tabs/song.alphatex" }],
    },
    {
      id: "d2",
      filename: "notes/intro-theory.md",
      title: "intro-theory",
      attachedTo: [{ type: "tab-section", id: "tabs/song.alphatex#intro" }],
    },
  ];

  it("renders a Whole-file references section listing tab-typed attachments", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={baseDocs}
          backlinks={[]}
        />
      </Wrap>,
    );
    expect(screen.getByText(/whole-file references/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /song-history\.md/i })).toBeInTheDocument();
  });

  it("renders a per-section References sub-list using the deterministic section id", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={baseDocs}
          backlinks={[]}
        />
      </Wrap>,
    );
    expect(screen.getByRole("button", { name: /intro-theory\.md/i })).toBeInTheDocument();
  });

  it("renders an Attach affordance per section and at file level when not readOnly", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={vi.fn()}
        />
      </Wrap>,
    );
    const attachButtons = screen.getAllByRole("button", { name: /attach/i });
    // makeMetadata has 2 sections (Intro, Verse 1) + 1 file-level → 3 buttons.
    expect(attachButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("invokes onOpenDocPicker with the composite section id when section Attach is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDocPicker = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={onOpenDocPicker}
        />
      </Wrap>,
    );
    const introAttach = screen.getByTestId("attach-section-intro");
    await user.click(introAttach);
    expect(onOpenDocPicker).toHaveBeenCalledWith(
      "tab-section",
      "tabs/song.alphatex#intro",
    );
  });

  it("invokes onOpenDocPicker with type 'tab' and the file path when file-level Attach is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDocPicker = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={onOpenDocPicker}
        />
      </Wrap>,
    );
    await user.click(screen.getByTestId("attach-file"));
    expect(onOpenDocPicker).toHaveBeenCalledWith("tab", "tabs/song.alphatex");
  });

  it("hides all Attach affordances when readOnly is true", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={vi.fn()}
          readOnly
        />
      </Wrap>,
    );
    expect(screen.queryAllByRole("button", { name: /attach/i })).toHaveLength(0);
  });

  it("uses deterministic section ids as React keys (duplicates render once each)", () => {
    const { container } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            sections: [
              { name: "Verse", startBeat: 0 },
              { name: "Verse", startBeat: 1920 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
        />
      </Wrap>,
    );
    const sectionRows = container.querySelectorAll('[data-testid^="tab-section-row-"]');
    expect(sectionRows).toHaveLength(2);
    expect(sectionRows[0].getAttribute("data-testid")).toBe("tab-section-row-verse");
    expect(sectionRows[1].getAttribute("data-testid")).toBe("tab-section-row-verse-2");
  });

  it("C2: uses stable sidecar IDs from resolveSectionIds when sidecar is present", async () => {
    const tabRefs = {
      read: vi.fn().mockResolvedValue({
        version: 2 as const,
        sectionRefs: {
          "stable-intro-99": "Intro",
          "stable-verse-99": "Verse 1",
        },
        trackRefs: [],
      }),
      write: vi.fn(),
    };
    const { container } = render(
      <Wrap tabRefs={tabRefs}>
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
        />
      </Wrap>,
    );
    // Wait for sidecar read to resolve and re-render with stable IDs.
    await vi.waitFor(() => {
      const introRow = container.querySelector('[data-testid="tab-section-row-stable-intro-99"]');
      expect(introRow).not.toBeNull();
    });
    expect(container.querySelector('[data-testid="tab-section-row-stable-verse-99"]')).not.toBeNull();
  });
});
