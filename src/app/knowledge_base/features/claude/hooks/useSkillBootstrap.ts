import { useEffect, useState } from "react";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

let bootstrapStarted = false;

export interface SkillBootstrapResult {
  /** Did this hook fire the install (i.e. the skill was missing on this session)? */
  justInstalled: boolean;
  /** Has the bootstrap completed (success or graceful skip)? */
  done: boolean;
  /** Error message if the install failed; null on success or skip. */
  error: string | null;
}

export function useSkillBootstrap(name: string = "knowledge-base"): SkillBootstrapResult {
  const [result, setResult] = useState<SkillBootstrapResult>({
    justInstalled: false,
    done: false,
    error: null,
  });

  useEffect(() => {
    if (bootstrapStarted) {
      // Per-session guard — this hook has already run once this session.
      setResult((prev) => (prev.done ? prev : { ...prev, done: true }));
      return;
    }
    bootstrapStarted = true;
    let cancelled = false;
    (async () => {
      try {
        const status = await tauriBridge.skillStatus(name);
        if (status.installed) {
          if (!cancelled) setResult({ justInstalled: false, done: true, error: null });
          return;
        }
        await tauriBridge.skillInstallFromBundle(name);
        if (!cancelled) setResult({ justInstalled: true, done: true, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setResult({ justInstalled: false, done: true, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  return result;
}

/** Test-only: reset the per-session guard so vitest can re-exercise the hook. */
export function __resetSkillBootstrapForTests() {
  bootstrapStarted = false;
}
