import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConflictBanner from "./ConflictBanner";

// Covers SHELL-1.9-01, SHELL-1.9-02, SHELL-1.9-03, SHELL-1.9-04: conflict banner UI and interaction.

describe("ConflictBanner", () => {
  it("SHELL-1.9-01: renders the conflict message in a polite status live region", () => {
    render(<ConflictBanner onReload={vi.fn()} onKeep={vi.fn()} />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("This file was changed outside the app.");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("SHELL-1.9-02: calls onReload when Reload from disk is clicked", async () => {
    const onReload = vi.fn();
    render(<ConflictBanner onReload={onReload} onKeep={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /reload from disk/i })
    );
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("SHELL-1.9-03: calls onKeep when Keep my edits is clicked", async () => {
    const onKeep = vi.fn();
    render(<ConflictBanner onReload={vi.fn()} onKeep={onKeep} />);
    await userEvent.click(
      screen.getByRole("button", { name: /keep my edits/i })
    );
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("SHELL-1.9-04: live region leads with the content message, not button chrome", () => {
    render(<ConflictBanner onReload={vi.fn()} onKeep={vi.fn()} />);
    const region = screen.getByRole("status");
    // The first child of the status region is the content span. Buttons
    // sit after it so a screen reader reads the message before any
    // button labels when the banner appears.
    const firstChildText = region.firstElementChild?.textContent ?? "";
    expect(firstChildText).toBe("This file was changed outside the app.");
  });
});
