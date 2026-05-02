"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { FileSystemError, classifyError, type FileSystemErrorKind } from "../domain/errors";

/**
 * Shell-level error surface. Holds the most recent actionable FS error
 * so `ShellErrorBanner` can render it. One error at a time; a new
 * `reportError` replaces the previous one. Intentionally minimal — no
 * queue, no timing, no severity matrix.
 */
export interface ReportedError {
  readonly kind: FileSystemErrorKind;
  readonly message: string;
  readonly context?: string;
  readonly at: number;
}

interface ShellErrorContextValue {
  current: ReportedError | null;
  /** Classify + publish. Accepts an unknown throw, a FileSystemError, or a
   *  pre-built `ReportedError`-ish message. */
  reportError: (e: unknown, context?: string) => void;
  dismiss: () => void;
}

const ShellErrorContext = createContext<ShellErrorContextValue | null>(null);

export function useShellErrors(): ShellErrorContextValue {
  const ctx = useContext(ShellErrorContext);
  if (!ctx) {
    throw new Error("useShellErrors must be used within a ShellErrorProvider");
  }
  return ctx;
}

export function ShellErrorProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ReportedError | null>(null);

  const reportError = useCallback((e: unknown, context?: string) => {
    const fsErr: FileSystemError = e instanceof FileSystemError ? e : classifyError(e);
    setCurrent({
      kind: fsErr.kind,
      message: fsErr.message,
      context,
      at: Date.now(),
    });
    // Mirror to console so devtools still shows the stack.
    console.error("[shell-error]", fsErr, context ?? "");
  }, []);

  const dismiss = useCallback(() => setCurrent(null), []);

  const value = useMemo<ShellErrorContextValue>(
    () => ({ current, reportError, dismiss }),
    [current, reportError, dismiss],
  );

  return <ShellErrorContext.Provider value={value}>{children}</ShellErrorContext.Provider>;
}

/** Test-only provider that accepts an explicit value. */
export function StubShellErrorProvider({
  value,
  children,
}: {
  value: ShellErrorContextValue;
  children: ReactNode;
}) {
  return <ShellErrorContext.Provider value={value}>{children}</ShellErrorContext.Provider>;
}
