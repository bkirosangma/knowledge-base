import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoVaultCTA } from "./knowledgeBase";

describe("SHELL-1.17-06: NoVaultCTA empty state", () => {
  it("renders an Open Vault button that calls onOpenVault", async () => {
    const onOpenVault = vi.fn();
    render(<NoVaultCTA onOpenVault={onOpenVault} />);
    await userEvent.click(screen.getByRole("button", { name: /open vault/i }));
    expect(onOpenVault).toHaveBeenCalledTimes(1);
  });
});
