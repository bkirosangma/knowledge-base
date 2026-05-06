import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrokenAnchorBanner } from "./BrokenAnchorBanner";

describe("BrokenAnchorBanner", () => {
  it("renders with testid and singular text for one heading + one ref", () => {
    render(
      <BrokenAnchorBanner
        docPath="doc-b.md"
        deletedIds={["intro"]}
        affectedRefs={[{ sourcePath: "doc-a.md", anchor: "intro" }]}
        onRemoveAnchors={vi.fn()}
        onLeaveBroken={vi.fn()}
      />
    );
    const banner = screen.getByTestId("broken-anchor-banner");
    expect(banner).toHaveTextContent(/1\s*heading\s+removed\s+from/);
    expect(banner).toHaveTextContent("doc-b.md");
    expect(banner).toHaveTextContent("1 wiki-link now broken.");
  });

  it("renders plural copy for multiple headings and refs", () => {
    render(
      <BrokenAnchorBanner
        docPath="doc-b.md"
        deletedIds={["intro", "outro"]}
        affectedRefs={[
          { sourcePath: "doc-a.md", anchor: "intro" },
          { sourcePath: "doc-c.md", anchor: "outro" },
          { sourcePath: "doc-d.md", anchor: "intro" },
        ]}
        onRemoveAnchors={vi.fn()}
        onLeaveBroken={vi.fn()}
      />
    );
    const banner = screen.getByTestId("broken-anchor-banner");
    expect(banner).toHaveTextContent(/2\s*headings\s+removed\s+from/);
    expect(banner).toHaveTextContent("3 wiki-links now broken.");
  });

  it("calls onRemoveAnchors when Remove anchors is clicked", async () => {
    const onRemoveAnchors = vi.fn();
    render(
      <BrokenAnchorBanner
        docPath="doc-b.md"
        deletedIds={["intro"]}
        affectedRefs={[{ sourcePath: "doc-a.md", anchor: "intro" }]}
        onRemoveAnchors={onRemoveAnchors}
        onLeaveBroken={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /remove anchors/i }));
    expect(onRemoveAnchors).toHaveBeenCalledOnce();
  });

  it("calls onLeaveBroken when Leave broken is clicked", async () => {
    const onLeaveBroken = vi.fn();
    render(
      <BrokenAnchorBanner
        docPath="doc-b.md"
        deletedIds={["intro"]}
        affectedRefs={[{ sourcePath: "doc-a.md", anchor: "intro" }]}
        onRemoveAnchors={vi.fn()}
        onLeaveBroken={onLeaveBroken}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /leave broken/i }));
    expect(onLeaveBroken).toHaveBeenCalledOnce();
  });
});
