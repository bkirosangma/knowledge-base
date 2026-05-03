import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TabMetadata } from "../../../domain/tabEngine";
import type { DocumentMeta } from "../../document/types";
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
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={baseDocs}
        backlinks={[]}
      />,
    );
    expect(screen.getByText(/whole-file references/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /song-history\.md/i })).toBeInTheDocument();
  });

  it("renders a per-section References sub-list using the deterministic section id", () => {
    render(
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={baseDocs}
        backlinks={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /intro-theory\.md/i })).toBeInTheDocument();
  });

  it("renders an Attach affordance per section and at file level when not readOnly", () => {
    render(
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={[]}
        backlinks={[]}
        onOpenDocPicker={vi.fn()}
      />,
    );
    const attachButtons = screen.getAllByRole("button", { name: /attach/i });
    // makeMetadata has 2 sections (Intro, Verse 1) + 1 file-level → 3 buttons.
    expect(attachButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("invokes onOpenDocPicker with the composite section id when section Attach is clicked", async () => {
    const user = userEvent.setup();
    const onOpenDocPicker = vi.fn();
    render(
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={[]}
        backlinks={[]}
        onOpenDocPicker={onOpenDocPicker}
      />,
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
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={[]}
        backlinks={[]}
        onOpenDocPicker={onOpenDocPicker}
      />,
    );
    await user.click(screen.getByTestId("attach-file"));
    expect(onOpenDocPicker).toHaveBeenCalledWith("tab", "tabs/song.alphatex");
  });

  it("hides all Attach affordances when readOnly is true", () => {
    render(
      <TabProperties
        metadata={makeMetadata()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        filePath="tabs/song.alphatex"
        documents={[]}
        backlinks={[]}
        onOpenDocPicker={vi.fn()}
        readOnly
      />,
    );
    expect(screen.queryAllByRole("button", { name: /attach/i })).toHaveLength(0);
  });

  it("uses deterministic section ids as React keys (duplicates render once each)", () => {
    const { container } = render(
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
      />,
    );
    const sectionRows = container.querySelectorAll('[data-testid^="tab-section-row-"]');
    expect(sectionRows).toHaveLength(2);
    expect(sectionRows[0].getAttribute("data-testid")).toBe("tab-section-row-verse");
    expect(sectionRows[1].getAttribute("data-testid")).toBe("tab-section-row-verse-2");
  });
});
