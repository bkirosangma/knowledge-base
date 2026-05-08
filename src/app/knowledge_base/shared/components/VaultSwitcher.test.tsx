import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultSwitcher } from "./VaultSwitcher";

const baseProps = {
  currentVaultName: "my-vault",
  recents: ["/Users/x/a", "/Users/x/b"] as string[],
  isUninitialised: false,
  onOpenVault: () => undefined,
  onSwitchVault: (_p: string) => undefined,
  onInitializeVault: () => undefined,
};

describe("VaultSwitcher", () => {
  it("shows the current vault name on the trigger", () => {
    render(<VaultSwitcher {...baseProps} />);
    expect(screen.getByRole("button", { name: /my-vault/i })).toBeInTheDocument();
  });

  it("opens the menu and lists Open Vault + recents", async () => {
    render(<VaultSwitcher {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /open vault/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/Users\/x\/a/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/Users\/x\/b/ })).toBeInTheDocument();
  });

  it("hides 'Initialize Vault…' when the vault is initialised", async () => {
    render(<VaultSwitcher {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.queryByRole("menuitem", { name: /initialize vault/i })).not.toBeInTheDocument();
  });

  it("shows 'Initialize Vault…' when the vault is uninitialised", async () => {
    render(<VaultSwitcher {...baseProps} isUninitialised />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /initialize vault/i })).toBeInTheDocument();
  });

  it("invokes onOpenVault on Open Vault…", async () => {
    const onOpenVault = vi.fn();
    render(<VaultSwitcher {...baseProps} onOpenVault={onOpenVault} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /open vault/i }));
    expect(onOpenVault).toHaveBeenCalledTimes(1);
  });

  it("invokes onSwitchVault with the picked recent path", async () => {
    const onSwitchVault = vi.fn();
    render(<VaultSwitcher {...baseProps} onSwitchVault={onSwitchVault} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /\/Users\/x\/b/ }));
    expect(onSwitchVault).toHaveBeenCalledWith("/Users/x/b");
  });

  it("closes the menu when clicking outside", async () => {
    render(
      <>
        <button type="button">outside</button>
        <VaultSwitcher {...baseProps} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /open vault/i })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: /outside/i }));
    expect(screen.queryByRole("menuitem", { name: /open vault/i })).not.toBeInTheDocument();
  });

  it("closes the menu when Escape is pressed", async () => {
    render(<VaultSwitcher {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /open vault/i })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: /open vault/i })).not.toBeInTheDocument();
  });
});
