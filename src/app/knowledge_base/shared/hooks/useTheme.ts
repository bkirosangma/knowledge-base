"use client";

/**
 * useTheme — single source of truth for the app's light/dark theme.
 *
 * Phase 3 PR 1 (2026-04-26). The hook owns the resolved theme + a setter
 * that persists the user's explicit choice to `vaultConfig.theme`. The
 * precedence on first mount is:
 *
 *   1. User has previously toggled and cached in vault config → that wins.
 *   2. No vault preference → fall back to OS `prefers-color-scheme`.
 *   3. No matchMedia / SSR / no preference → light.
 *
 * After mount, `setTheme` is the only way the theme changes — we do NOT
 * subscribe to OS theme changes because the user may have explicitly
 * chosen the *opposite* of OS pref, and silently flipping would be wrong.
 *
 * Mounted under `RepositoryProvider`, so vault writes go through the
 * repo. When no vault is open (`vaultConfig` is null) the hook still
 * works in-memory — useful pre-folder-pick.
 */

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { RepositoryContext } from "../../shell/RepositoryContext";
import { readOrNull } from "../../domain/repositoryHelpers";

export type Theme = "light" | "dark";

export interface UseThemeApi {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

function resolveOsPref(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useTheme(): UseThemeApi {
  // SSR-safe initial state — never call matchMedia during render. The
  // `useEffect` below promotes to OS / vault preference once mounted.
  const [theme, setThemeState] = useState<Theme>("light");
  // Tolerate a missing RepositoryProvider (top-level shell mounts the
  // hook outside the provider since RepositoryProvider requires a
  // root handle). When absent, we still flip OS-pref → in-memory.
  const repos = useContext(RepositoryContext);
  const vaultConfig = repos?.vaultConfig ?? null;

  // Track whether the user has explicitly toggled this session. If yes,
  // a later vaultConfig load (e.g. directory just got picked) must NOT
  // clobber the user's in-flight choice.
  const userToggledRef = useRef(false);

  // ─── First-mount + vault-config sync ─────────────────────────────────
  // Re-runs whenever the vaultConfig repo identity changes (folder pick,
  // folder swap). When the user has already toggled this session we
  // skip the vault read so we don't yank their choice.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Default to OS pref while we wait for vault read.
      const osPref = resolveOsPref();
      if (!vaultConfig) {
        if (!userToggledRef.current && !cancelled) setThemeState(osPref);
        return;
      }
      try {
        const cfg = await readOrNull(() => vaultConfig.read());
        if (cancelled || userToggledRef.current) return;
        const stored = cfg?.theme;
        if (stored === "light" || stored === "dark") {
          setThemeState(stored);
        } else {
          setThemeState(osPref);
        }
      } catch {
        // Read failure is non-fatal here — fall back to OS pref. The
        // ShellErrorBanner is reserved for user-visible data-loss
        // failures; theme misses default cleanly.
        if (!cancelled && !userToggledRef.current) setThemeState(osPref);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultConfig]);

  const setTheme = useCallback(
    (t: Theme) => {
      userToggledRef.current = true;
      setThemeState(t);
      // Persist to vault if one is open. Best-effort — if persistence
      // fails the in-memory state still flips, the user's choice is
      // honoured for the rest of the session.
      if (vaultConfig) {
        void vaultConfig.update({ theme: t }).catch(() => {
          // Swallow; theme persistence is non-critical UX, not data.
        });
      }
    },
    [vaultConfig],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
