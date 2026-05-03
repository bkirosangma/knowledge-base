import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TabMetadata } from "../../../domain/tabEngine";
import { TabProperties } from "./TabProperties";

function makeMetadata(overrides: Partial<TabMetadata> = {}): TabMetadata {
  return {
    title: "Intro Riff",
    artist: "Demo",
    subtitle: "Practice",
    tempo: 120,
    key: "Gmaj",
    timeSignature: { numerator: 4, denominator: 4 },
    capo: 2,
    tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
    tracks: [{ id: "0", name: "Guitar", instrument: "guitar" }],
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
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Practice")).toBeInTheDocument();
  });

  it("renders tempo, key, time signature, capo, and tuning", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("Gmaj")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
    expect(screen.getByText("Capo 2")).toBeInTheDocument();
    expect(screen.getByText("E2 A2 D3 G3 B3 E4")).toBeInTheDocument();
  });

  it("renders the section list with names and start beats", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Verse 1")).toBeInTheDocument();
    // Start beat shown alongside the section name (visually small).
    expect(screen.getByText(/beat 0/i)).toBeInTheDocument();
    expect(screen.getByText(/beat 1920/i)).toBeInTheDocument();
  });

  it("renders the track names", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Guitar")).toBeInTheDocument();
  });

  it("hides full content and shows the collapsed chrome when collapsed=true", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={true} onToggleCollapse={vi.fn()} />,
    );
    // The panel is still mounted (for slide animation); just narrowed.
    expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
    expect(screen.getByTestId("tab-properties")).toHaveAttribute("data-collapsed", "true");
    // Content fields should NOT be visible.
    expect(screen.queryByText("120 BPM")).not.toBeInTheDocument();
  });

  it("toggle button calls onToggleCollapse when clicked", async () => {
    const onToggleCollapse = vi.fn();
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={onToggleCollapse} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /collapse properties|expand properties/i }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders a placeholder when metadata is null (pre-load state)", () => {
    render(
      <TabProperties metadata={null} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText(/loading score/i)).toBeInTheDocument();
  });

  it("omits optional fields when absent (artist, subtitle, key)", () => {
    const md = makeMetadata({ artist: undefined, subtitle: undefined, key: undefined });
    render(
      <TabProperties metadata={md} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Practice")).not.toBeInTheDocument();
    expect(screen.queryByText("Gmaj")).not.toBeInTheDocument();
    // Title still renders.
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
  });
});
