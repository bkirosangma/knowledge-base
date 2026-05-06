import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AttachmentPreviewModal,
  type PreviewItem,
} from "./AttachmentPreviewModal";

function makeProps(items: PreviewItem[]) {
  return {
    open: true,
    items,
    onClose: vi.fn(),
    onOpenInPane: vi.fn(),
    readDocument: vi.fn(async (path: string) => `# Hello from ${path}\n\nbody`),
    resolveWikiLinkPath: (linkPath: string) => linkPath,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AttachmentPreviewModal — 4-way contract (plan Task 4 cases)", () => {
  it("renders nothing when open is false", () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    const { container } = render(
      <AttachmentPreviewModal {...props} open={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when items list is empty", () => {
    const props = makeProps([]);
    const { container } = render(<AttachmentPreviewModal {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it("hides the left rail when only one item is present", () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.queryByTestId("attachment-rail")).toBeNull();
  });

  it("shows the left rail with grouped headings when items > 1", () => {
    const items: PreviewItem[] = [
      { type: "document", filename: "a.md" },
      { type: "document", filename: "b.md" },
      { type: "diagram", filename: "x.diagram" },
    ];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByTestId("attachment-rail")).toBeInTheDocument();
    expect(
      screen.getByTestId("attachment-rail-group-document"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("attachment-rail-group-diagram"),
    ).toBeInTheDocument();
  });

  it("dispatches to the document body when active item type is document", async () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    render(<AttachmentPreviewModal {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("attachment-body-document")).toBeInTheDocument(),
    );
  });

  it("renders the placeholder body for diagram type in MVP-2b", () => {
    const items: PreviewItem[] = [{ type: "diagram", filename: "x.diagram" }];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(
      screen.getByTestId("attachment-body-placeholder-diagram"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/preview not yet implemented for diagram/i),
    ).toBeInTheDocument();
  });

  it("renders the placeholder body for svg type in MVP-2b", () => {
    const items: PreviewItem[] = [{ type: "svg", filename: "x.svg" }];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(
      screen.getByTestId("attachment-body-placeholder-svg"),
    ).toBeInTheDocument();
  });

  it("renders the placeholder body for tab type in MVP-2b", () => {
    const items: PreviewItem[] = [{ type: "tab", filename: "x.alphatex" }];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(
      screen.getByTestId("attachment-body-placeholder-tab"),
    ).toBeInTheDocument();
  });

  it("Open in pane button forwards the active filename and closes the modal", () => {
    const onOpenInPane = vi.fn();
    const onClose = vi.fn();
    const props = {
      ...makeProps([{ type: "document", filename: "a.md" }]),
      onOpenInPane,
      onClose,
    };
    render(<AttachmentPreviewModal {...props} />);
    fireEvent.click(screen.getByTestId("attachment-modal-open-in-pane"));
    expect(onOpenInPane).toHaveBeenCalledWith("a.md", null);
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── Ported coverage from former DocPreviewModal.test.tsx ──────────────
//
// These cases exist on `main` against `DocPreviewModal` and document
// behaviour the task description tells us to preserve in the rename:
// the spinner + error states, Escape close, backdrop click, entity-name
// badge, filename in header, wiki-link sanitize survival, and wiki-link
// click navigation. They keep DIAG-3.20-{03..11} coverage continuous
// across the rename.
describe("AttachmentPreviewModal — preserved DocPreviewModal coverage", () => {
  it("DIAG-3.20-08: shows a spinner while the active document is loading", () => {
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(() => new Promise<string | null>(() => {})), // never resolves
    };
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("DIAG-3.20-08: shows an error message when readDocument returns null", async () => {
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(async () => null),
    };
    render(<AttachmentPreviewModal {...props} />);
    await waitFor(() =>
      expect(screen.getByText(/could not load/i)).toBeInTheDocument(),
    );
  });

  it("DIAG-3.20-08: shows an error message when readDocument rejects", async () => {
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(() => Promise.reject(new Error("fs error"))),
    };
    render(<AttachmentPreviewModal {...props} />);
    await waitFor(() =>
      expect(screen.getByText(/could not load/i)).toBeInTheDocument(),
    );
  });

  it("DIAG-3.20-04: calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      onClose,
    };
    render(<AttachmentPreviewModal {...props} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("DIAG-3.20-05: calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      onClose,
    };
    render(<AttachmentPreviewModal {...props} />);
    fireEvent.click(screen.getByTestId("attachment-modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("DIAG-3.20-09: shows the entity name badge when the active item carries entityName", async () => {
    const props = makeProps([
      {
        type: "document",
        filename: "docs/auth-flow.md",
        entityName: "Auth Flow",
      },
    ]);
    render(<AttachmentPreviewModal {...props} />);
    await waitFor(() =>
      expect(screen.getByText("Auth Flow")).toBeInTheDocument(),
    );
  });

  it("DIAG-3.20-03: shows the filename in the header", async () => {
    const props = makeProps([
      { type: "document", filename: "docs/auth-flow.md" },
    ]);
    render(<AttachmentPreviewModal {...props} />);
    // Header uses title?? filename — bare filename renders here.
    await waitFor(() =>
      expect(
        screen.getAllByText("docs/auth-flow.md").length,
      ).toBeGreaterThanOrEqual(1),
    );
  });

  it("DIAG-3.20-10: renders wiki-links with data attributes preserved through DOMPurify", async () => {
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(async () =>
        "See [[other-doc#section|Display Text]] for context.",
      ),
    };
    render(<AttachmentPreviewModal {...props} />);
    const span = await screen.findByText("Display Text");
    expect(span.tagName).toBe("SPAN");
    expect(span).toHaveClass("wiki-link");
    expect(span).toHaveAttribute("data-wiki-link", "other-doc");
    expect(span).toHaveAttribute("data-wiki-section", "section");
  });

  it("DIAG-3.20-11: clicking a wiki-link forwards the resolved target + anchor and closes the modal", async () => {
    const onOpenInPane = vi.fn();
    const onClose = vi.fn();
    // Resolver mimics the production wikiLinkParser: bare names under
    // the previewed doc's directory become `<dir>/<name>.md`.
    const resolveWikiLinkPath = (linkPath: string, dir: string) =>
      `${dir}/${linkPath}.md`;
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(async () => "See [[guide|the guide]] for setup."),
      onOpenInPane,
      onClose,
      resolveWikiLinkPath,
    };
    render(<AttachmentPreviewModal {...props} />);
    const link = await screen.findByText("the guide");
    fireEvent.click(link);
    expect(onOpenInPane).toHaveBeenCalledWith("docs/guide.md", null);
    expect(onClose).toHaveBeenCalled();
  });

  it("DIAG-3.20-11: forwards the wiki-link section anchor when present", async () => {
    const onOpenInPane = vi.fn();
    const resolveWikiLinkPath = (linkPath: string, dir: string) =>
      `${dir}/${linkPath}.md`;
    const props = {
      ...makeProps([{ type: "document", filename: "docs/auth-flow.md" }]),
      readDocument: vi.fn(async () =>
        "See [[guide#setup|the guide]] for setup.",
      ),
      onOpenInPane,
      resolveWikiLinkPath,
    };
    render(<AttachmentPreviewModal {...props} />);
    const link = await screen.findByText("the guide");
    fireEvent.click(link);
    expect(onOpenInPane).toHaveBeenCalledWith("docs/guide.md", "setup");
  });
});
