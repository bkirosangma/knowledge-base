import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocumentMeta } from "../../document/types";
import { TabReferencesList } from "./TabReferencesList";

const attached = (filename: string, attachedTo: DocumentMeta["attachedTo"]): DocumentMeta => ({
  id: filename,
  filename,
  title: filename.replace(/\.md$/, ""),
  attachedTo,
});

describe("TabReferencesList", () => {
  it("renders an empty state when there are no references", () => {
    render(<TabReferencesList attachments={[]} backlinks={[]} />);
    expect(screen.getByText(/no references/i)).toBeInTheDocument();
  });

  it("renders attachments with a paperclip indicator", () => {
    render(
      <TabReferencesList
        attachments={[
          attached("notes/song-history.md", [
            { type: "tab", id: "tabs/song.alphatex" },
          ]),
        ]}
        backlinks={[]}
      />,
    );
    const row = screen.getByTestId("tab-reference-row");
    expect(row).toHaveTextContent("song-history.md");
    expect(row).toHaveAttribute("data-source", "attachment");
  });

  it("renders wiki-link backlinks with an arrow indicator and no detach button", () => {
    render(
      <TabReferencesList
        attachments={[]}
        backlinks={[{ sourcePath: "notes/intro-theory.md" }]}
      />,
    );
    const row = screen.getByTestId("tab-reference-row");
    expect(row).toHaveTextContent("intro-theory.md");
    expect(row).toHaveAttribute("data-source", "backlink");
    expect(row.querySelector('[data-testid="detach-reference"]')).toBeNull();
  });

  it("merges and de-duplicates by sourcePath, with attached winning over backlink", () => {
    render(
      <TabReferencesList
        attachments={[
          attached("notes/intro-theory.md", [
            { type: "tab-section", id: "tabs/song.alphatex#intro" },
          ]),
        ]}
        backlinks={[{ sourcePath: "notes/intro-theory.md" }]}
      />,
    );
    const rows = screen.getAllByTestId("tab-reference-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-source", "attachment");
  });

  it("invokes onPreview with the source path on click", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(
      <TabReferencesList
        attachments={[]}
        backlinks={[{ sourcePath: "notes/x.md" }]}
        onPreview={onPreview}
      />,
    );
    await user.click(screen.getByRole("button", { name: /x\.md/i }));
    expect(onPreview).toHaveBeenCalledWith("notes/x.md");
  });

  it("invokes onDetach with the doc path when detach is clicked", async () => {
    const user = userEvent.setup();
    const onDetach = vi.fn();
    render(
      <TabReferencesList
        attachments={[
          attached("notes/song-history.md", [
            { type: "tab", id: "tabs/song.alphatex" },
          ]),
        ]}
        backlinks={[]}
        onDetach={onDetach}
      />,
    );
    await user.click(screen.getByTestId("detach-reference"));
    expect(onDetach).toHaveBeenCalledWith("notes/song-history.md");
  });

  it("hides the detach button when readOnly is true", () => {
    render(
      <TabReferencesList
        attachments={[
          attached("notes/song-history.md", [
            { type: "tab", id: "tabs/song.alphatex" },
          ]),
        ]}
        backlinks={[]}
        readOnly
      />,
    );
    expect(screen.queryByTestId("detach-reference")).toBeNull();
  });
});
