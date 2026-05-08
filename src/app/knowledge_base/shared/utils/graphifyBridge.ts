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

/**
 * Emit cross-references via a write callback. The callback writes text to
 * a vault-relative path — callers pass `repos.document.write` or
 * `tauriBridge.writeText`. Using a callback keeps this utility independent
 * of both FSA and the Tauri bridge.
 */
export async function emitCrossReferences(
  writeText: (path: string, content: string) => Promise<void>,
  references: CrossReference[],
): Promise<void> {
  try {
    await writeText(
      ".archdesigner/cross-references.json",
      JSON.stringify({ version: 1, references }, null, 2),
    );
  } catch {
    // Silently fail — graphify integration is best-effort
    console.warn("Failed to emit cross-references for graphify");
  }
}
