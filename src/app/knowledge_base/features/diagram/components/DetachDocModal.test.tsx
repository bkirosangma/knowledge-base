import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import DetachDocModal from "./DetachDocModal";

const baseProps = {
  docPath: "docs/auth-flow.md",
  attachments: [],
  wikiBacklinks: [],
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("DetachDocModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the filename in the title", () => {
    render(<DetachDocModal {...baseProps} />);
    expect(screen.getByText(/auth-flow\.md/i)).toBeInTheDocument();
  });

  it("hides 'Also referenced by' section when no refs exist", () => {
    render(<DetachDocModal {...baseProps} />);
    expect(screen.queryByText(/also referenced by/i)).not.toBeInTheDocument();
  });

  it("shows attachments in the references list", () => {
    render(
      <DetachDocModal
        {...baseProps}
        attachments={[{ entityType: "node", entityId: "node-1" }]}
      />
    );
    expect(screen.getByText(/also referenced by/i)).toBeInTheDocument();
    expect(screen.getByText(/node.*node-1/i)).toBeInTheDocument();
  });

  it("shows wiki backlinks in the references list (deduplicated display)", () => {
    render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
    expect(screen.getByText(/other\.md/i)).toBeInTheDocument();
  });

  it("danger warning is hidden when 'Also delete' is unchecked", () => {
    render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("danger warning appears when 'Also delete' is checked and there are backlinks", () => {
    render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /also delete/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/other\.md/);
  });

  it("calls onCancel when Cancel is clicked", () => {
    render(<DetachDocModal {...baseProps} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm with alsoDelete=false when checkbox unchecked", () => {
    render(<DetachDocModal {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^detach$/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm with alsoDelete=true when checkbox checked", () => {
    render(<DetachDocModal {...baseProps} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /also delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^detach$/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledWith(true);
  });
});
