import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UninitializedVaultSplash } from "./UninitializedVaultSplash";

describe("UninitializedVaultSplash", () => {
  it("renders the folder name and the spec wording", () => {
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={() => undefined}
        onPickDifferent={() => undefined}
      />,
    );
    expect(
      screen.getByText(/my-vault is not yet a knowledge-base vault/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /initialize this vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open a different folder/i })).toBeInTheDocument();
  });

  it("invokes onInitialize when 'Initialize this vault' is clicked", async () => {
    const onInitialize = vi.fn();
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={onInitialize}
        onPickDifferent={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /initialize this vault/i }));
    expect(onInitialize).toHaveBeenCalledTimes(1);
  });

  it("invokes onPickDifferent when 'Open a different folder' is clicked", async () => {
    const onPickDifferent = vi.fn();
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={() => undefined}
        onPickDifferent={onPickDifferent}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open a different folder/i }));
    expect(onPickDifferent).toHaveBeenCalledTimes(1);
  });
});
