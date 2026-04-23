import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import CreateAttachDocModal from "./CreateAttachDocModal";

const baseProps = {
  defaultFilename: "auth-flow-notes.md",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("CreateAttachDocModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-fills the filename input with defaultFilename", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    expect(screen.getByRole("textbox")).toHaveValue("auth-flow-notes.md");
  });

  it("calls onCancel when Cancel is clicked", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm with filename and editNow=false when checkbox unchecked", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    const checkbox = screen.getByRole("checkbox", { name: /edit now/i });
    if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith("auth-flow-notes.md", false);
  });

  it("calls onConfirm with editNow=true when checkbox is checked", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    const checkbox = screen.getByRole("checkbox", { name: /edit now/i });
    if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith("auth-flow-notes.md", true);
  });

  it("uses updated filename from input when confirmed", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "my-custom-doc.md" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith("my-custom-doc.md", expect.any(Boolean));
  });

  it("disables confirm button when filename is empty", () => {
    render(<CreateAttachDocModal {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
  });
});
