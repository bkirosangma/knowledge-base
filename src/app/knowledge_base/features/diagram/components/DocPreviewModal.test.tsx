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

it("shows a spinner while loading", () => {
  baseProps.readDocument.mockReturnValue(new Promise(() => {})); // never resolves
  render(<DocPreviewModal {...baseProps} />);
  expect(screen.getByRole("status")).toBeInTheDocument(); // spinner
});

it("renders document content after loading", async () => {
  baseProps.readDocument.mockResolvedValue("# Hello\n\nWorld");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
  });
});

it("shows error message when readDocument returns null", async () => {
  baseProps.readDocument.mockResolvedValue(null);
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("shows error message when readDocument rejects", async () => {
  baseProps.readDocument.mockRejectedValue(new Error("fs error"));
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("calls onClose when Escape is pressed", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("calls onClose when backdrop is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.click(screen.getByTestId("doc-preview-backdrop"));
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("calls onOpenInPane and onClose when 'Open in pane' is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("# Doc");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => screen.getByText(/open in pane/i));
  fireEvent.click(screen.getByText(/open in pane/i));
  expect(baseProps.onOpenInPane).toHaveBeenCalledWith("docs/auth-flow.md");
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("shows entity name badge when entityName is provided", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} entityName="Auth Flow" />);
  await waitFor(() => expect(screen.getByText("Auth Flow")).toBeInTheDocument());
});

it("shows the filename in the header", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => expect(screen.getByText("auth-flow.md")).toBeInTheDocument());
});
