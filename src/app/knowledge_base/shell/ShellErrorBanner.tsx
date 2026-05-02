"use client";

import { useShellErrors, type ReportedError } from "./ShellErrorContext";

/**
 * Minimal banner. Renders the most recent reported error as a
 * top-of-viewport strip with a dismiss button. No queue, no animation,
 * no severity matrix — if future scope asks for any of those, that's
 * explicit new scope.
 */
export default function ShellErrorBanner() {
  const { current, dismiss } = useShellErrors();
  if (!current) return null;

  return (
    <div
      role="alert"
      data-testid="shell-error-banner"
      data-kind={current.kind}
      className="fixed top-0 left-0 right-0 z-50 flex items-start gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900"
    >
      <div className="flex-1 leading-snug">
        <strong className="font-semibold">{kindLabel(current.kind)}</strong>
        {current.context ? (
          <span className="ml-1 text-red-800">· {current.context}</span>
        ) : null}
        <div className="mt-0.5 text-red-800">{current.message}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss error"
        className="text-red-700 underline decoration-dotted hover:text-red-900"
      >
        Dismiss
      </button>
    </div>
  );
}

function kindLabel(kind: ReportedError["kind"]): string {
  switch (kind) {
    case "not-found":
      return "File not found";
    case "malformed":
      return "File is malformed";
    case "permission":
      return "Permission denied";
    case "quota-exceeded":
      return "Storage is full";
    case "unknown":
    default:
      return "File system error";
  }
}
