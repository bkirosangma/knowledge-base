import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConflictBanner from "./ConflictBanner";

// Covers PERSIST-7.2-01/02/03: conflict banner UI and interaction.

describe("ConflictBanner", () => {
  it("renders the conflict message", () => {
    render(<ConflictBanner onReload={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file was changed outside the app."
    );
  });

  it("calls onReload when Reload from disk is clicked", async () => {
    const onReload = vi.fn();
    render(<ConflictBanner onReload={onReload} onKeep={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /reload from disk/i })
    );
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("calls onKeep when Keep my edits is clicked", async () => {
    const onKeep = vi.fn();
    render(<ConflictBanner onReload={vi.fn()} onKeep={onKeep} />);
    await userEvent.click(
      screen.getByRole("button", { name: /keep my edits/i })
    );
    expect(onKeep).toHaveBeenCalledOnce();
  });
});
