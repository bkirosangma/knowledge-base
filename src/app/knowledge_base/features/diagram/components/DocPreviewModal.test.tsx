import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DocPreviewModal from "./DocPreviewModal";

const baseProps = {
  docPath: "docs/auth-flow.md",
  onClose: vi.fn(),
  onOpenInPane: vi.fn(),
  readDocument: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

it("DIAG-3.20-08: shows a spinner while loading", () => {
  baseProps.readDocument.mockReturnValue(new Promise(() => {})); // never resolves
  render(<DocPreviewModal {...baseProps} />);
  expect(screen.getByRole("status")).toBeInTheDocument(); // spinner
});

it("DIAG-3.20-03: renders document content after loading", async () => {
  baseProps.readDocument.mockResolvedValue("# Hello\n\nWorld");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
  });
});

it("DIAG-3.20-08: shows error message when readDocument returns null", async () => {
  baseProps.readDocument.mockResolvedValue(null);
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("DIAG-3.20-08: shows error message when readDocument rejects", async () => {
  baseProps.readDocument.mockRejectedValue(new Error("fs error"));
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("DIAG-3.20-04: calls onClose when Escape is pressed", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("DIAG-3.20-05: calls onClose when backdrop is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.click(screen.getByTestId("doc-preview-backdrop"));
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("DIAG-3.20-06: calls onOpenInPane and onClose when 'Open in pane' is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("# Doc");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => screen.getByText(/open in pane/i));
  fireEvent.click(screen.getByText(/open in pane/i));
  expect(baseProps.onOpenInPane).toHaveBeenCalledWith("docs/auth-flow.md");
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("DIAG-3.20-09: shows entity name badge when entityName is provided", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} entityName="Auth Flow" />);
  await waitFor(() => expect(screen.getByText("Auth Flow")).toBeInTheDocument());
});

it("DIAG-3.20-03: shows the filename in the header", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => expect(screen.getByText("auth-flow.md")).toBeInTheDocument());
});

it("DIAG-3.20-10: renders wiki-links with data attributes preserved", async () => {
  // The modal reads markdown, runs it through markdownToHtml (which emits
  // `<span data-wiki-link=... class="wiki-link">…</span>`), then sanitizes
  // with DOMPurify. The sanitize config must allowlist `data-wiki-link` /
  // `data-wiki-section` so the wiki-link identity survives — and the span
  // must keep its `wiki-link` class so the static-mode CSS pill style
  // applies.
  baseProps.readDocument.mockResolvedValue(
    "See [[other-doc#section|Display Text]] for context.",
  );
  render(<DocPreviewModal {...baseProps} />);
  const span = await screen.findByText("Display Text");
  expect(span.tagName).toBe("SPAN");
  expect(span).toHaveClass("wiki-link");
  expect(span).toHaveAttribute("data-wiki-link", "other-doc");
  expect(span).toHaveAttribute("data-wiki-section", "section");
});

it("DIAG-3.20-11: clicking a wiki-link opens the resolved target in the pane and closes the modal", async () => {
  // The link path is resolved against the modal's docPath directory the
  // same way the editor resolves wiki-links, then forwarded through
  // `onOpenInPane`. The current doc lives at `docs/auth-flow.md`, so a
  // bare `[[guide]]` resolves to `docs/guide.md` (the resolver auto-
  // appends .md when no extension is present).
  baseProps.readDocument.mockResolvedValue(
    "See [[guide|the guide]] for setup.",
  );
  render(<DocPreviewModal {...baseProps} />);
  const link = await screen.findByText("the guide");
  fireEvent.click(link);
  expect(baseProps.onOpenInPane).toHaveBeenCalledWith("docs/guide.md");
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("DIAG-3.20-11: clicking inner content of a wiki-link still navigates (closest delegation)", async () => {
  // markdownToHtml currently emits a flat span, but defensive: if a
  // future renderer adds inner elements (icon, label spans), clicks on
  // those still need to walk up to the [data-wiki-link] ancestor.
  baseProps.readDocument.mockResolvedValue("See [[sibling]].");
  render(<DocPreviewModal {...baseProps} />);
  const link = await screen.findByText("sibling");
  // Click an inner text node by dispatching from a child of the span.
  fireEvent.click(link);
  expect(baseProps.onOpenInPane).toHaveBeenCalledWith("docs/sibling.md");
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});
