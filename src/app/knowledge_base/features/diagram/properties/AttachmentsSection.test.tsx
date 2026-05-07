import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AttachmentsSection } from "./AttachmentsSection";
import type { AttachmentBuckets, DocumentMeta } from "../../document/types";

const empty: AttachmentBuckets = { docs: [], diagrams: [], svgs: [], tabs: [] };

function makeProps(buckets: Partial<Record<keyof AttachmentBuckets, DocumentMeta[]>> = {}) {
  return {
    buckets: { ...empty, ...buckets } as AttachmentBuckets,
    onPreview: vi.fn(),
    onDetach: vi.fn(),
    onAttach: vi.fn(),
    readOnly: false,
  };
}

describe("AttachmentsSection", () => {
  it("renders the section title with no rows when all buckets are empty", () => {
    render(<AttachmentsSection {...makeProps()} />);
    expect(screen.getByText(/attachments/i)).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-row-a.md")).toBeNull();
  });

  it("renders rows under the docs group when docs bucket has entries", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} />);
    expect(screen.getByTestId("attachment-group-docs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-row-a.md")).toBeInTheDocument();
  });

  it("hides empty groups", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} />);
    expect(screen.queryByTestId("attachment-group-diagrams")).toBeNull();
    expect(screen.queryByTestId("attachment-group-svgs")).toBeNull();
    expect(screen.queryByTestId("attachment-group-tabs")).toBeNull();
  });

  it("Preview button calls onPreview with filename and type", () => {
    const onPreview = vi.fn();
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId("attachment-preview-a.md"));
    expect(onPreview).toHaveBeenCalledWith("a.md", "document");
  });

  it("Detach button calls onDetach with filename and type", () => {
    const onDetach = vi.fn();
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} onDetach={onDetach} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));
    expect(onDetach).toHaveBeenCalledWith("a.md", "document");
  });

  it("Attach button calls onAttach", () => {
    const onAttach = vi.fn();
    render(<AttachmentsSection {...makeProps()} onAttach={onAttach} />);
    fireEvent.click(screen.getByTestId("attachment-attach-button"));
    expect(onAttach).toHaveBeenCalled();
  });

  it("hides Attach + Detach buttons when readOnly is true", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} readOnly />);
    expect(screen.queryByTestId("attachment-attach-button")).toBeNull();
    expect(screen.queryByTestId("attachment-detach-a.md")).toBeNull();
  });
});

describe("AttachmentsSection — cascade-detach modal", () => {
  function makeCascadeProps(overrides?: { wikiBacklinks?: string[]; attachments?: { entityType: string; entityId: string }[] }) {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    return {
      ...props,
      entityScope: { entityType: "flow" as const, entityId: "flow-1" },
      getDocumentReferences: vi.fn().mockReturnValue({
        attachments: overrides?.attachments ?? [],
        wikiBacklinks: overrides?.wikiBacklinks ?? [],
      }),
      deleteDocumentWithCleanup: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("opens DetachDocModal when Detach is clicked on a document row + cascade props are provided", () => {
    const props = makeCascadeProps();
    render(<AttachmentsSection {...props} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // onDetach is NOT called yet — the modal is the gate.
    expect(props.onDetach).not.toHaveBeenCalled();
  });

  it("does NOT open the modal when only some cascade props are provided", () => {
    const props = makeCascadeProps();
    // Drop deleteDocumentWithCleanup — modal should not open; direct onDetach instead.
    render(<AttachmentsSection {...props} deleteDocumentWithCleanup={undefined} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(props.onDetach).toHaveBeenCalledWith("a.md", "document");
  });

  it("queries getDocumentReferences with the file path and entityScope on Detach click", () => {
    const props = makeCascadeProps();
    render(<AttachmentsSection {...props} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));
    expect(props.getDocumentReferences).toHaveBeenCalledWith("a.md", { entityType: "flow", entityId: "flow-1" });
  });

  it("Confirm without 'also delete' fires onDetach but skips deleteDocumentWithCleanup", async () => {
    const props = makeCascadeProps();
    render(<AttachmentsSection {...props} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));

    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /^detach$/i });
    fireEvent.click(confirm);

    expect(props.onDetach).toHaveBeenCalledWith("a.md", "document");
    // Microtask yield so the async onConfirm resolves.
    await Promise.resolve();
    expect(props.deleteDocumentWithCleanup).not.toHaveBeenCalled();
  });
});
