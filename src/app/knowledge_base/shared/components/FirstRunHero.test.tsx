import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import FirstRunHero from "./FirstRunHero";
import { MOBILE_BREAKPOINT_PX } from "../hooks/useViewport";

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

  // FIRSTRUN-10.1-09: Mobile read-only notice (KB-040)
  describe("mobile read-only notice", () => {
    interface FakeMQL {
      matches: boolean;
      media: string;
      addEventListener: (t: "change", l: (e: MediaQueryListEvent) => void) => void;
      removeEventListener: (t: "change", l: (e: MediaQueryListEvent) => void) => void;
      listeners: Set<(e: MediaQueryListEvent) => void>;
      fire: (m: boolean) => void;
    }
    const fakes = new Map<string, FakeMQL>();
    let originalMatchMedia: typeof window.matchMedia | undefined;

    function ensureFake(media: string, matches: boolean): FakeMQL {
      let f = fakes.get(media);
      if (!f) {
        const listeners = new Set<(e: MediaQueryListEvent) => void>();
        f = {
          matches,
          media,
          listeners,
          addEventListener: (_t, l) => { listeners.add(l); },
          removeEventListener: (_t, l) => { listeners.delete(l); },
          fire(next: boolean) {
            this.matches = next;
            const e = { matches: next, media } as unknown as MediaQueryListEvent;
            this.listeners.forEach((l) => l(e));
          },
        };
        fakes.set(media, f);
      }
      return f;
    }

    beforeEach(() => {
      fakes.clear();
      originalMatchMedia = window.matchMedia;
    });

    afterEach(() => {
      if (originalMatchMedia) {
        window.matchMedia = originalMatchMedia;
      } else {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      }
    });

    function installMatchMedia(isMobile: boolean) {
      const MOBILE_Q = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
      ensureFake(MOBILE_Q, isMobile);
      (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
        (q: string) => ensureFake(q, false) as unknown as MediaQueryList;
    }

    it("FIRSTRUN-10.1-09: renders the mobile notice when viewport is mobile", () => {
      installMatchMedia(true);
      render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={vi.fn() as never} />);
      const notice = screen.getByTestId("first-run-mobile-notice");
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveAttribute("role", "note");
      expect(notice).toHaveTextContent(/Mobile is for browsing/i);
      expect(notice).toHaveTextContent(/desktop/i);
    });

    it("FIRSTRUN-10.1-09: omits the mobile notice on desktop viewports", () => {
      installMatchMedia(false);
      render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={vi.fn() as never} />);
      expect(screen.queryByTestId("first-run-mobile-notice")).toBeNull();
    });

    it("FIRSTRUN-10.1-09: shows the notice when the viewport flips to mobile", () => {
      installMatchMedia(false);
      render(<FirstRunHero onOpenFolder={vi.fn()} onOpenWithSeed={vi.fn() as never} />);
      expect(screen.queryByTestId("first-run-mobile-notice")).toBeNull();
      const MOBILE_Q = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
      act(() => { fakes.get(MOBILE_Q)!.fire(true); });
      expect(screen.getByTestId("first-run-mobile-notice")).toBeInTheDocument();
    });
  });
});
