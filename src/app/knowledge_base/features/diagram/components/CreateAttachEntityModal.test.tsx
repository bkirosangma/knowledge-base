import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateAttachEntityModal } from "./CreateAttachEntityModal";

function makeProps(overrides: Partial<React.ComponentProps<typeof CreateAttachEntityModal>> = {}) {
  return {
    open: true,
    defaultFilename: "untitled.md",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("CreateAttachEntityModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders with Document tab active by default", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    const tab = screen.getByTestId("create-attach-type-document");
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).toBeNull();
  });

  it("disables confirm when SVG tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-svg"));
    const confirm = screen.getByTestId("create-attach-confirm");
    expect(confirm.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText(/persistence ships in a future mvp/i)).toBeInTheDocument();
  });

  it("disables confirm when Diagram tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-diagram"));
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).not.toBeNull();
  });

  it("disables confirm when Tab tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-tab"));
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).not.toBeNull();
  });

  it("calls onConfirm with type='document' and the filename", () => {
    const onConfirm = vi.fn();
    render(<CreateAttachEntityModal {...makeProps({ onConfirm })} />);
    const input = screen.getByTestId("create-attach-filename") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "notes.md" } });
    fireEvent.click(screen.getByTestId("create-attach-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("notes.md", false, "document");
  });

  it("toggling 'Edit now' is forwarded to onConfirm", () => {
    const onConfirm = vi.fn();
    render(<CreateAttachEntityModal {...makeProps({ onConfirm })} />);
    fireEvent.click(screen.getByTestId("create-attach-edit-now"));
    fireEvent.click(screen.getByTestId("create-attach-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("untitled.md", true, "document");
  });

  it("Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(<CreateAttachEntityModal {...makeProps({ onCancel })} />);
    fireEvent.click(screen.getByTestId("create-attach-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(<CreateAttachEntityModal {...makeProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("disables confirm button when filename is empty (Document tab)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.change(screen.getByTestId("create-attach-filename"), { target: { value: "" } });
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).not.toBeNull();
  });

  it("Escape closes the modal via onCancel (focus trap)", () => {
    const onCancel = vi.fn();
    render(<CreateAttachEntityModal {...makeProps({ onCancel })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("backdrop click cancels", () => {
    const onCancel = vi.fn();
    render(<CreateAttachEntityModal {...makeProps({ onCancel })} />);
    const backdrop = document.querySelector("[data-testid='create-attach-backdrop']");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onCancel).toHaveBeenCalled();
  });
});
