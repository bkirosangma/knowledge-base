// Trigger a browser download of a Blob with the given filename
// (KB-011 / EXPORT-9.5). Browsers handle name collisions automatically
// by appending `(1)` / `(2)` etc. — the audit plan's "date suffix on
// collision" intent in browser context.

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Some browsers require the anchor to be in the DOM before click()
  // for the download attribute to take effect.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation — Safari occasionally aborts the download if the
  // URL is revoked synchronously after click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
