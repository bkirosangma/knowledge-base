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
