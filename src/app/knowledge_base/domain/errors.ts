/**
 * Typed error surface at the repository boundary.
 *
 * Every repository operation — `DiagramRepository`, `DocumentRepository`,
 * `LinkIndexRepository`, `VaultConfigRepository`, and the `.archdesigner`
 * helper on top of them — throws a `FileSystemError` on any failure
 * (including "file not found"). Consumers either:
 *
 *   1. Opt in to the common "treat not-found as empty" via `readOrNull`
 *      (see `./repositoryHelpers.ts`) and keep a narrow try/catch for
 *      actionable kinds (permission / malformed / quota / unknown);
 *   2. Or try/catch + `reportError` for full distinction.
 *
 * The old "swallow everything → return null" pattern is gone. Silent
 * catches were hiding data-loss bugs — e.g. a failed `.md` load produced
 * an empty editor the user could then save back over real content.
 */

export type FileSystemErrorKind =
  | "not-found"
  | "malformed"
  | "permission"
  | "quota-exceeded"
  | "unknown";

export class FileSystemError extends Error {
  readonly kind: FileSystemErrorKind;
  readonly cause?: unknown;

  constructor(kind: FileSystemErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "FileSystemError";
    this.kind = kind;
    this.cause = cause;
  }
}

/** Narrow a thrown unknown into a typed `FileSystemError`. Idempotent. */
export function classifyError(e: unknown): FileSystemError {
  if (e instanceof FileSystemError) return e;
  if (e instanceof DOMException) {
    if (e.name === "NotFoundError") {
      return new FileSystemError("not-found", e.message || "File not found", e);
    }
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      return new FileSystemError("permission", e.message || "Permission denied", e);
    }
    if (e.name === "QuotaExceededError") {
      return new FileSystemError("quota-exceeded", e.message || "Storage quota exceeded", e);
    }
  }
  // Plain Error with matching name (happens in our mocks and under
  // jsdom where DOMException isn't always constructed).
  if (e instanceof Error) {
    if (e.name === "NotFoundError") {
      return new FileSystemError("not-found", e.message || "File not found", e);
    }
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      return new FileSystemError("permission", e.message || "Permission denied", e);
    }
    if (e.name === "QuotaExceededError") {
      return new FileSystemError("quota-exceeded", e.message || "Storage quota exceeded", e);
    }
    return new FileSystemError("unknown", e.message || String(e), e);
  }
  return new FileSystemError("unknown", String(e), e);
}

/** Type guard: `e instanceof FileSystemError && e.kind === kind`. */
export function isFileSystemErrorOfKind(e: unknown, kind: FileSystemErrorKind): e is FileSystemError {
  return e instanceof FileSystemError && e.kind === kind;
}
