// src/app/knowledge_base/shared/utils/graphifyBridge.ts

/**
 * Emits cross-reference edges to graphify when documents reference diagrams
 * or other documents. Called on document save.
 *
 * This writes a lightweight JSON file that graphify's rebuild hook picks up.
 */

export interface CrossReference {
  source: string;       // e.g., "docs/overview.md"
  target: string;       // e.g., "diagrams/auth-flow.json"
  type: "references";   // edge type in the knowledge graph
  sourceType: "document" | "diagram" | "tab";
  targetType: "document" | "diagram" | "tab";
}

export async function emitCrossReferences(
  dirHandle: FileSystemDirectoryHandle,
  references: CrossReference[],
): Promise<void> {
  try {
    // Ensure .archdesigner directory exists
    const configDir = await dirHandle.getDirectoryHandle(".archdesigner", { create: true });
    const fileHandle = await configDir.getFileHandle("cross-references.json", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({ version: 1, references }, null, 2));
    await writable.close();
  } catch {
    // Silently fail — graphify integration is best-effort
    console.warn("Failed to emit cross-references for graphify");
  }
}
