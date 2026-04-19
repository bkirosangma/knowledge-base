/**
 * Shared helpers for repository consumers (Phase 5c, 2026-04-19).
 */

import { FileSystemError, classifyError, isFileSystemErrorOfKind } from "./errors";

/**
 * Run a repo read that may fail with `not-found`. Returns `null` if the
 * read throws `FileSystemError` with kind `"not-found"`. Re-throws every
 * other error (including non-FileSystemError throws, classified first)
 * unchanged — callers can `try { await readOrNull(...) } catch (e) {
 * reportError(e) }` to surface actionable kinds.
 *
 * This is the ergonomic wrapper for the very common "absent file is not
 * an error" pattern (vault config on a non-vault folder, draft load,
 * diagram load after the file was renamed out, etc.). Sites that need
 * to *distinguish* kinds should use a direct try/catch instead.
 */
export async function readOrNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (isFileSystemErrorOfKind(e, "not-found")) return null;
    if (e instanceof FileSystemError) throw e;
    // Un-classified throw — classify and re-throw so callers always
    // receive a `FileSystemError`, never a raw DOMException.
    throw classifyError(e);
  }
}
