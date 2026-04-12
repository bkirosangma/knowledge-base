/**
 * Directory scope — namespaces localStorage keys so that different
 * project folders never collide, even if they contain files with
 * identical relative paths.
 *
 * A random 8-char hex ID is generated once per folder and stored in
 * IndexedDB alongside the directory handle.
 */

let currentScope: string | null = null;

export function getDirectoryScope(): string | null {
  return currentScope;
}

export function setDirectoryScope(id: string): void {
  currentScope = id;
}

export function clearDirectoryScope(): void {
  currentScope = null;
}

/**
 * Returns a localStorage key scoped to the current directory.
 * If no scope is active, returns the base key unchanged.
 */
export function scopedKey(base: string): string {
  return currentScope ? `${base}[${currentScope}]` : base;
}
