"use client";

import { useEffect, useState } from "react";

/**
 * Read the current theme from the nearest `[data-theme]` ancestor and
 * stay in sync as the attribute mutates.
 *
 * `useTheme()` returns per-instance React state — each component that
 * calls it owns an independent `theme` value. Toggling the theme via
 * the shell's instance updates the `data-theme` attribute (and the CSS
 * vars flip with it), but other components with their own `useTheme()`
 * instance never learn about the change. Anywhere that needs to react
 * to the live theme without owning the toggle (diagram nodes, layers,
 * canvas chrome) reads through this hook instead.
 *
 * SSR-safe: defaults to "light" before the first effect tick. The
 * MutationObserver on the attribute fires synchronously when the host
 * sets `data-theme`, so a toggle propagates the same frame.
 */
export function useObservedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const read = (): "light" | "dark" => {
      const target = document.querySelector("[data-theme]");
      const value = target?.getAttribute("data-theme");
      return value === "dark" ? "dark" : "light";
    };
    setTheme(read());

    const target = document.querySelector("[data-theme]");
    if (!target) return;
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(target, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
