import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReferenceRow } from "./ReferenceRow";

describe("ReferenceRow", () => {
  it("renders the file's basename as label", () => {
    render(<ReferenceRow filePath="docs/a.md" label="A Document" source="attachment" />);
    expect(screen.getByText("A Document")).toBeInTheDocument();
  });

  it("uses Paperclip icon when source is attachment", () => {
    const { container } = render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" />,
    );
    expect(container.querySelector('[data-testid="reference-row-icon-attachment"]')).not.toBeNull();
  });

  it("uses ArrowUpRight icon when source is wiki-link", () => {
    const { container } = render(
      <ReferenceRow filePath="a.md" label="A" source="wiki-link" />,
    );
    expect(container.querySelector('[data-testid="reference-row-icon-wiki-link"]')).not.toBeNull();
  });

  it("invokes onPreview when the row is clicked", () => {
    const onPreview = vi.fn();
    render(<ReferenceRow filePath="a.md" label="A" source="attachment" onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button", { name: /open a/i }));
    expect(onPreview).toHaveBeenCalledOnce();
  });

  it("invokes onDetach when the detach button is clicked", () => {
    const onDetach = vi.fn();
    render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" onDetach={onDetach} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /detach a/i }));
    expect(onDetach).toHaveBeenCalledOnce();
  });

  it("hides the detach button when readOnly", () => {
    render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" readOnly onDetach={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /detach a/i })).toBeNull();
  });

  it("hides the detach button when source is wiki-link", () => {
    render(
      <ReferenceRow filePath="a.md" label="A" source="wiki-link" onDetach={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /detach a/i })).toBeNull();
  });

  it("uses Icon override when provided", () => {
    const Custom = (props: React.SVGProps<SVGSVGElement> & { size?: number | string }) => (
      <span data-testid="custom-icon" {...(props as object)} />
    );
    // Verify that when Icon is passed, the custom element renders (span, not svg).
    // The component passes data-testid={iconTestId} onto it, which is fine —
    // the custom-icon testid from inside the component is overwritten by the
    // spread, but the element tag itself confirms the override was used.
    const { container } = render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" Icon={Custom} />,
    );
    // The icon slot should be a <span> (from Custom), not an <svg> (from Paperclip).
    const iconEl = container.querySelector('[data-testid="reference-row-icon-attachment"]');
    expect(iconEl).not.toBeNull();
    expect(iconEl!.tagName.toLowerCase()).toBe("span");
  });
});
