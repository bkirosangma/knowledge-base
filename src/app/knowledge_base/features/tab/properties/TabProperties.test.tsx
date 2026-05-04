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

  it("clicking M toggles mute via onToggleMute(trackId) (TAB-009 T17)", () => {
    const onToggleMute = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onToggleMute={onToggleMute}
        />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText("Mute Lead"));
    expect(onToggleMute).toHaveBeenCalledWith("0");
  });

  it("M button aria-pressed reflects mutedTrackIds", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          mutedTrackIds={["0"]}
        />
      </Wrap>,
    );
    expect(screen.getByLabelText("Mute Lead")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Mute Bass")).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking M does not fire onSwitchActiveTrack (e.stopPropagation)", () => {
    const onSwitch = vi.fn();
    const onToggleMute = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
          onToggleMute={onToggleMute}
        />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText("Mute Bass"));
    expect(onToggleMute).toHaveBeenCalledWith("1");
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("clicking S toggles solo via onToggleSolo(trackId)", () => {
    const onToggleSolo = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onToggleSolo={onToggleSolo}
        />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText("Solo Lead"));
    expect(onToggleSolo).toHaveBeenCalledWith("0");
  });

  it("S button aria-pressed reflects soloedTrackIds", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          soloedTrackIds={["1"]}
        />
      </Wrap>,
    );
    expect(screen.getByLabelText("Solo Lead")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Solo Bass")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking S does not fire onSwitchActiveTrack", () => {
    const onSwitch = vi.fn();
    const onToggleSolo = vi.fn();
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
          onToggleSolo={onToggleSolo}
        />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText("Solo Bass"));
    expect(onToggleSolo).toHaveBeenCalledWith("1");
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("M and S are no-ops when callbacks are undefined", () => {
    render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    expect(() => fireEvent.click(screen.getByLabelText("Mute Lead"))).not.toThrow();
    expect(() => fireEvent.click(screen.getByLabelText("Solo Lead"))).not.toThrow();
  });

  it("active track expanded editor shows 6 string inputs for 6-string guitar (TAB-009 T18)", () => {
    const { getAllByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
        />
      </Wrap>,
    );
    expect(getAllByLabelText(/String \d/)).toHaveLength(6);
  });

  it("active track expanded editor shows 4 string inputs for 4-string bass (TAB-009 T18)", () => {
    const { getAllByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={1}
        />
      </Wrap>,
    );
    expect(getAllByLabelText(/String \d/)).toHaveLength(4);
  });

  it("changing a string fires onSetTrackTuning with the new array (TAB-009 T18)", () => {
    const onSet = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSetTrackTuning={onSet}
        />
      </Wrap>,
    );
    const input = getByLabelText("String 1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "F2" } });
    fireEvent.blur(input);
    expect(onSet).toHaveBeenCalledWith("0", ["F2", "A2", "D3", "G3", "B3", "E4"]);
  });

  it("changing capo fires onSetTrackCapo with clamped int (TAB-009 T18)", () => {
    const onSet = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSetTrackCapo={onSet}
        />
      </Wrap>,
    );
    const input = getByLabelText("Capo") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.blur(input);
    expect(onSet).toHaveBeenCalledWith("0", 3);
  });

  it("capo input clamps to [0, 24] (TAB-009 T18)", () => {
    const onSet = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            // capo: 5 so both out-of-range values trigger a real change
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 5 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSetTrackCapo={onSet}
        />
      </Wrap>,
    );
    const input = getByLabelText("Capo") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect(onSet).toHaveBeenLastCalledWith("0", 24);
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    expect(onSet).toHaveBeenLastCalledWith("0", 0);
  });

  it("invalid pitch shows inline error and does not fire onSetTrackTuning (TAB-009 T18)", () => {
    const onSet = vi.fn();
    const { getByLabelText, getByRole } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSetTrackTuning={onSet}
        />
      </Wrap>,
    );
    const input = getByLabelText("String 1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Z9" } });
    fireEvent.blur(input);
    expect(getByRole("alert")).toBeTruthy();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("only renders the editor for the active row (TAB-009 T18)", () => {
    const { container } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
        />
      </Wrap>,
    );
    expect(container.querySelectorAll("[data-track-editor]")).toHaveLength(1);
  });

  it("clicking inside the editor does not fire onSwitchActiveTrack (TAB-009 T18)", () => {
    const onSwitch = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
        />
      </Wrap>,
    );
    fireEvent.click(getByLabelText("String 1"));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("entering same value does not fire onSetTrackTuning (no-op when unchanged) (TAB-009 T18)", () => {
    const onSet = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onSetTrackTuning={onSet}
        />
      </Wrap>,
    );
    const input = getByLabelText("String 1") as HTMLInputElement;
    fireEvent.blur(input); // value unchanged from defaultValue "E2"
    expect(onSet).not.toHaveBeenCalled();
  });

  // TAB-009 T19 — + Add track inline form

  it("renders + Add track row at bottom of tracks list (TAB-009 T19)", () => {
    const { getByText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    expect(getByText("+ Add track")).toBeTruthy();
  });

  it("clicking + Add track expands inline form with Name and Instrument (TAB-009 T19)", () => {
    const { getByText, getByLabelText, queryByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    expect(queryByLabelText("Name")).toBeNull();
    fireEvent.click(getByText("+ Add track"));
    expect(getByLabelText("Name")).toBeTruthy();
    expect(getByLabelText("Instrument")).toBeTruthy();
  });

  it("Save dispatches onAddTrack with form values + active-track tuning when instrument matches (TAB-009 T19)", () => {
    const onAdd = vi.fn();
    const { getByText, getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onAddTrack={onAdd}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    fireEvent.change(getByLabelText("Name"), { target: { value: "Rhythm" } });
    fireEvent.click(getByText("Save"));
    expect(onAdd).toHaveBeenCalledWith({
      name: "Rhythm",
      instrument: "guitar",
      tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
      capo: 0,
    });
  });

  it("Save uses default bass tuning when adding a bass track from a guitar-active context (TAB-009 T19)", () => {
    const onAdd = vi.fn();
    const { getByText, getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          activeTrackIndex={0}
          onAddTrack={onAdd}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    fireEvent.change(getByLabelText("Name"), { target: { value: "Bass" } });
    fireEvent.change(getByLabelText("Instrument"), { target: { value: "bass" } });
    fireEvent.click(getByText("Save"));
    expect(onAdd).toHaveBeenCalledWith({
      name: "Bass",
      instrument: "bass",
      tuning: ["E1", "A1", "D2", "G2"],
      capo: 0,
    });
  });

  it("Cancel collapses form without firing onAddTrack (TAB-009 T19)", () => {
    const onAdd = vi.fn();
    const { getByText, queryByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onAddTrack={onAdd}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    fireEvent.click(getByText("Cancel"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(queryByLabelText("Name")).toBeNull();
  });

  it("Save button is disabled and does not fire onAddTrack when name is empty (TAB-009 T19)", () => {
    const onAdd = vi.fn();
    const { getByText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onAddTrack={onAdd}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    // Name is empty; Save button should be disabled
    const saveBtn = getByText("Save") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("Save with whitespace-only name does not fire onAddTrack (TAB-009 T19)", () => {
    const onAdd = vi.fn();
    const { getByText, getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onAddTrack={onAdd}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    fireEvent.change(getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.click(getByText("Save"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("re-opening + Add track after Cancel clears prior form state (TAB-009 T19)", () => {
    const { getByText, getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    fireEvent.click(getByText("+ Add track"));
    fireEvent.change(getByLabelText("Name"), { target: { value: "Stale" } });
    fireEvent.click(getByText("Cancel"));
    fireEvent.click(getByText("+ Add track"));
    expect((getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  // TAB-009 T20 — track kebab + remove + last-track guard

  const STD_GUITAR = ["E2", "A2", "D3", "G3", "B3", "E4"];
  const STD_BASS = ["E1", "A1", "D2", "G2"];
  const t0 = { id: "0", name: "Lead", instrument: "guitar" as const, tuning: STD_GUITAR, capo: 0 };
  const t1 = { id: "1", name: "Bass", instrument: "bass" as const, tuning: STD_BASS, capo: 0 };

  it("kebab opens a menu with Remove track on multi-track scores (TAB-009 T20)", () => {
    const { getByLabelText, getByText } = render(
      <Wrap>
        <TabProperties
          {...{
            metadata: makeMetadata({ tracks: [t0, t1] }),
            collapsed: false,
            onToggleCollapse: vi.fn(),
          }}
        />
      </Wrap>,
    );
    fireEvent.click(getByLabelText("Track menu Bass"));
    expect(getByText("Remove track")).toBeTruthy();
  });

  it("kebab → Remove fires onRemoveTrack after window.confirm returns true (TAB-009 T20)", () => {
    const onRemoveTrack = vi.fn();
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    try {
      const { getByLabelText, getByText } = render(
        <Wrap>
          <TabProperties
            metadata={makeMetadata({ tracks: [t0, t1] })}
            collapsed={false}
            onToggleCollapse={vi.fn()}
            onRemoveTrack={onRemoveTrack}
          />
        </Wrap>,
      );
      fireEvent.click(getByLabelText("Track menu Bass"));
      fireEvent.click(getByText("Remove track"));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Bass"));
      expect(onRemoveTrack).toHaveBeenCalledWith("1");
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("kebab → Remove does NOT fire onRemoveTrack when window.confirm returns false (TAB-009 T20)", () => {
    const onRemoveTrack = vi.fn();
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);
    try {
      const { getByLabelText, getByText } = render(
        <Wrap>
          <TabProperties
            metadata={makeMetadata({ tracks: [t0, t1] })}
            collapsed={false}
            onToggleCollapse={vi.fn()}
            onRemoveTrack={onRemoveTrack}
          />
        </Wrap>,
      );
      fireEvent.click(getByLabelText("Track menu Bass"));
      fireEvent.click(getByText("Remove track"));
      expect(onRemoveTrack).not.toHaveBeenCalled();
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it("kebab on a single-track score does not show Remove track (last-track guard) (TAB-009 T20)", () => {
    const { getByLabelText, queryByText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({ tracks: [t0] })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    fireEvent.click(getByLabelText("Track menu Lead"));
    expect(queryByText("Remove track")).toBeNull();
  });

  it("clicking kebab does not fire onSwitchActiveTrack (e.stopPropagation) (TAB-009 T20)", () => {
    const onSwitch = vi.fn();
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({ tracks: [t0, t1] })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onSwitchActiveTrack={onSwitch}
        />
      </Wrap>,
    );
    fireEvent.click(getByLabelText("Track menu Bass"));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("kebab toggles open and closed (TAB-009 T20)", () => {
    const { getByLabelText, queryByText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({ tracks: [t0, t1] })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    fireEvent.click(getByLabelText("Track menu Bass"));
    expect(queryByText("Remove track")).toBeTruthy();
    fireEvent.click(getByLabelText("Track menu Bass"));
    expect(queryByText("Remove track")).toBeNull();
  });

  it("aria-expanded reflects menu open state (TAB-009 T20)", () => {
    const { getByLabelText } = render(
      <Wrap>
        <TabProperties
          metadata={makeMetadata({ tracks: [t0, t1] })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
        />
      </Wrap>,
    );
    const kebab = getByLabelText("Track menu Bass");
    expect(kebab).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(kebab);
    expect(kebab).toHaveAttribute("aria-expanded", "true");
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

// TAB-009 T23 — track row attachment badges + attach button
describe("TabProperties — track attachment badges (TAB-009 T23)", () => {
  const TUNING_GUITAR = ["E2", "A2", "D3", "G3", "B3", "E4"];
  const TUNING_BASS = ["E1", "A1", "D2", "G2"];

  function makeTabRefs(trackRefs: { id: string; name: string }[]) {
    return {
      read: vi.fn().mockResolvedValue({
        version: 2 as const,
        sectionRefs: {},
        trackRefs,
      }),
      write: vi.fn(),
    };
  }

  it("track row shows attached docs scoped to that track via tab-track entityId (TAB-009 T23)", async () => {
    const tabRefs = makeTabRefs([
      { id: "tk-lead-uuid", name: "Lead" },
      { id: "tk-bass-uuid", name: "Bass" },
    ]);
    const docs = [
      {
        id: "d-lead",
        filename: "lead-tab-tips.md",
        title: "Lead tab tips",
        attachedTo: [{ type: "tab-track" as const, id: "song.alphatex#track:tk-lead-uuid" }],
      },
    ];
    render(
      <Wrap tabRefs={tabRefs}>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: TUNING_GUITAR, capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: TUNING_BASS, capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="song.alphatex"
          documents={docs}
          onPreviewDocument={vi.fn()}
        />
      </Wrap>,
    );
    // Once sidecar resolves, the attached doc filename appears under the Lead track row.
    // TabReferencesList renders the basename of the attachment filename, not the title.
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /lead-tab-tips\.md/i })).toBeInTheDocument();
    });
  });

  it("attach button on a track row opens DocumentPicker with tab-track + entityId (TAB-009 T23)", async () => {
    const tabRefs = makeTabRefs([
      { id: "tk-lead-uuid", name: "Lead" },
      { id: "tk-bass-uuid", name: "Bass" },
    ]);
    const onOpenDocPicker = vi.fn();
    render(
      <Wrap tabRefs={tabRefs}>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: TUNING_GUITAR, capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: TUNING_BASS, capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="song.alphatex"
          documents={[]}
          onOpenDocPicker={onOpenDocPicker}
        />
      </Wrap>,
    );
    // Wait for the sidecar to load and attach buttons to appear.
    const bassAttach = await vi.waitFor(() => screen.getByTestId("attach-track-1"));
    fireEvent.click(bassAttach);
    expect(onOpenDocPicker).toHaveBeenCalledWith("tab-track", "song.alphatex#track:tk-bass-uuid");
  });

  it("attach button is hidden if the track has no sidecar entry (TAB-009 T23)", async () => {
    // sidecar has only 1 trackRef, but metadata has 2 tracks.
    const tabRefs = makeTabRefs([{ id: "tk-lead-uuid", name: "Lead" }]);
    const onOpenDocPicker = vi.fn();
    const { queryByTestId } = render(
      <Wrap tabRefs={tabRefs}>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: TUNING_GUITAR, capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: TUNING_BASS, capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="song.alphatex"
          documents={[]}
          onOpenDocPicker={onOpenDocPicker}
        />
      </Wrap>,
    );
    // Wait for sidecar to resolve; Lead should have its button, Bass should not.
    await vi.waitFor(() => expect(screen.getByTestId("attach-track-0")).toBeInTheDocument());
    expect(queryByTestId("attach-track-1")).toBeNull();
  });

  it("clicking the attach button does not fire onSwitchActiveTrack (e.stopPropagation) (TAB-009 T23)", async () => {
    const tabRefs = makeTabRefs([
      { id: "tk-lead-uuid", name: "Lead" },
      { id: "tk-bass-uuid", name: "Bass" },
    ]);
    const onSwitch = vi.fn();
    const onOpenDocPicker = vi.fn();
    render(
      <Wrap tabRefs={tabRefs}>
        <TabProperties
          metadata={makeMetadata({
            tracks: [
              { id: "0", name: "Lead", instrument: "guitar", tuning: TUNING_GUITAR, capo: 0 },
              { id: "1", name: "Bass", instrument: "bass", tuning: TUNING_BASS, capo: 0 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="song.alphatex"
          documents={[]}
          activeTrackIndex={0}
          onSwitchActiveTrack={onSwitch}
          onOpenDocPicker={onOpenDocPicker}
        />
      </Wrap>,
    );
    const bassAttach = await vi.waitFor(() => screen.getByTestId("attach-track-1"));
    fireEvent.click(bassAttach);
    expect(onOpenDocPicker).toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
