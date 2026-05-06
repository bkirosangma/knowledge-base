import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SourcesSection } from "./SourcesSection";
import type { SourceLink } from "../types/sources";

describe("SourcesSection", () => {
  it("renders 'No sources recorded.' when empty in read-only", () => {
    render(<SourcesSection sources={[]} onChange={vi.fn()} readOnly />);
    expect(screen.getByText("No sources recorded.")).toBeInTheDocument();
    expect(screen.queryByTestId("sources-add")).not.toBeInTheDocument();
  });

  it("renders empty-state edit copy when not readOnly", () => {
    render(<SourcesSection sources={[]} onChange={vi.fn()} />);
    expect(screen.getByText("No sources recorded — add one below.")).toBeInTheDocument();
    expect(screen.getByTestId("sources-add")).toBeInTheDocument();
  });

  it("renders one row per source with display label", () => {
    const sources: SourceLink[] = [
      { url: "https://datatracker.ietf.org/doc/html/rfc6749", title: "RFC 6749 — OAuth 2.0" },
      { url: "https://example.com" },
    ];
    render(<SourcesSection sources={sources} onChange={vi.fn()} readOnly />);
    expect(screen.getByTestId("sources-row-0")).toHaveTextContent("RFC 6749 — OAuth 2.0");
    expect(screen.getByTestId("sources-row-1")).toHaveTextContent("example.com");
  });

  it("calls onChange with new array when adding a source", async () => {
    const onChange = vi.fn();
    function Host() {
      // mimics a controlled host: re-render with the latest array passed up
      const [s, setS] = (require("react") as typeof import("react")).useState<SourceLink[]>([]);
      return (
        <SourcesSection
          sources={s}
          onChange={(next) => {
            onChange(next);
            setS(next);
          }}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByTestId("sources-add"));
    const urlInput = await screen.findByTestId("sources-url-input-0");
    await userEvent.type(urlInput, "https://x.com");
    urlInput.blur();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual([{ url: "https://x.com", title: "" }]);
  });

  it("rejects invalid URLs on blur (does not commit)", async () => {
    const onChange = vi.fn();
    function Host() {
      const [s, setS] = (require("react") as typeof import("react")).useState<SourceLink[]>([]);
      return (
        <SourcesSection
          sources={s}
          onChange={(next) => {
            onChange(next);
            setS(next);
          }}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByTestId("sources-add"));
    const urlInput = await screen.findByTestId("sources-url-input-0");
    await userEvent.type(urlInput, "javascript:bad");
    urlInput.blur();
    // No call to onChange should ever carry the invalid URL.
    const allValid = onChange.mock.calls.every(
      (call) => !(call[0] as SourceLink[]).some((s) => s.url === "javascript:bad"),
    );
    expect(allValid).toBe(true);
    expect(await screen.findByTestId("sources-error-0")).toBeInTheDocument();
  });

  it("calls onChange with the row removed when 'Remove' clicked", async () => {
    const onChange = vi.fn();
    const sources: SourceLink[] = [
      { url: "https://a.com" },
      { url: "https://b.com" },
    ];
    render(<SourcesSection sources={sources} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("sources-remove-0"));
    expect(onChange).toHaveBeenCalledWith([{ url: "https://b.com" }]);
  });

  it("Open button has target=_blank and rel=noopener noreferrer", () => {
    const sources: SourceLink[] = [{ url: "https://x.com" }];
    render(<SourcesSection sources={sources} onChange={vi.fn()} />);
    const open = screen.getByTestId("sources-open-0");
    expect(open).toHaveAttribute("target", "_blank");
    const rel = open.getAttribute("rel") || "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  it("hides edit affordances when readOnly", () => {
    const sources: SourceLink[] = [{ url: "https://a.com" }];
    render(<SourcesSection sources={sources} onChange={vi.fn()} readOnly />);
    expect(screen.queryByTestId("sources-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sources-remove-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("sources-open-0")).toBeInTheDocument();
  });
});
