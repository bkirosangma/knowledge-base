import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FirstRunHero from "./FirstRunHero";

describe("FirstRunHero", () => {
  it("renders the welcome copy + both CTAs", () => {
    const onOpenFolder = vi.fn();
    const onOpenWithSeed = vi.fn();
    render(<FirstRunHero onOpenFolder={onOpenFolder} onOpenWithSeed={onOpenWithSeed} />);
    expect(screen.getByText(/Your knowledge base, in a folder you control/)).toBeInTheDocument();
    expect(screen.getByTestId("first-run-open-folder")).toBeInTheDocument();
    expect(screen.getByTestId("first-run-sample-vault")).toBeInTheDocument();
  });

  it("Open Vault calls onOpenFolder", () => {
    const onOpenFolder = vi.fn();
    const onOpenWithSeed = vi.fn();
    render(<FirstRunHero onOpenFolder={onOpenFolder} onOpenWithSeed={onOpenWithSeed} />);
    fireEvent.click(screen.getByTestId("first-run-open-folder"));
    expect(onOpenFolder).toHaveBeenCalledOnce();
  });

  it("Try with sample vault calls onOpenWithSeed with a seeder fn", async () => {
    const onOpenFolder = vi.fn();
    const onOpenWithSeed = vi.fn().mockResolvedValue({ handle: {} });
    render(<FirstRunHero onOpenFolder={onOpenFolder} onOpenWithSeed={onOpenWithSeed} />);
    fireEvent.click(screen.getByTestId("first-run-sample-vault"));
    await waitFor(() => expect(onOpenWithSeed).toHaveBeenCalledOnce());
    const seeder = onOpenWithSeed.mock.calls[0][0];
    expect(typeof seeder).toBe("function");
  });

  it("disables both buttons while seeding", async () => {
    let resolve: (v: unknown) => void = () => {};
    const onOpenWithSeed = vi.fn(
      () => new Promise<unknown>((r) => { resolve = r; }),
    );
    render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={onOpenWithSeed as never} />);
    fireEvent.click(screen.getByTestId("first-run-sample-vault"));
    await waitFor(() => {
      expect(screen.getByTestId("first-run-open-folder")).toBeDisabled();
      expect(screen.getByTestId("first-run-sample-vault")).toBeDisabled();
    });
    resolve({ handle: {} });
  });

  it("shows the error banner when seeding throws", async () => {
    const onOpenWithSeed = vi.fn().mockRejectedValue(new Error("permission denied"));
    render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={onOpenWithSeed as never} />);
    fireEvent.click(screen.getByTestId("first-run-sample-vault"));
    const alert = await screen.findByTestId("first-run-error");
    expect(alert).toHaveTextContent("permission denied");
  });

  it("toggles the about disclosure", () => {
    render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={vi.fn() as never} />);
    expect(screen.queryByTestId("first-run-about-list")).toBeNull();
    fireEvent.click(screen.getByTestId("first-run-about-toggle"));
    expect(screen.getByTestId("first-run-about-list")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("first-run-about-toggle"));
    expect(screen.queryByTestId("first-run-about-list")).toBeNull();
  });
});
