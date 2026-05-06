import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { HeadingCopyLink } from "./HeadingCopyLink";

afterEach(() => {
  vi.useRealTimers();
});

describe("HeadingCopyLink", () => {
  it("copies [[currentDoc#section]] to clipboard on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HeadingCopyLink currentDocFilename="auth.md" headerId="overview" />);
    fireEvent.click(screen.getByTestId("heading-copy-link-overview"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("[[auth.md#overview]]"),
    );
  });

  it("uses the hover-affordance className (opacity-0 + group-hover:opacity-100)", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HeadingCopyLink currentDocFilename="auth.md" headerId="overview" />);
    const btn = screen.getByTestId("heading-copy-link-overview");
    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("group-hover:opacity-100");
    expect(btn.className).toContain("transition-opacity");
  });

  it("shows 'Copied!' for ~1500ms after a successful copy, then reverts", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HeadingCopyLink currentDocFilename="auth.md" headerId="overview" />);
    const btn = screen.getByTestId("heading-copy-link-overview");
    fireEvent.click(btn);

    // Drain the awaited writeText microtask so setCopied(true) runs.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Copied!")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Copied!")).toBeNull();
  });

  it("includes vault-relative paths verbatim (e.g. docs/auth.md)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <HeadingCopyLink currentDocFilename="docs/auth.md" headerId="overview" />,
    );
    fireEvent.click(screen.getByTestId("heading-copy-link-overview"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("[[docs/auth.md#overview]]"),
    );
  });
});
