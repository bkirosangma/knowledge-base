/**
 * Score → alphaTex serializer. Wraps `@coderline/alphatab`'s
 * `AlphaTexExporter` behind a stable function signature so consumers
 * (`useTabContent`, the editor chunk) don't depend on the alphaTab
 * class surface directly.
 *
 * Lazy-imports alphatab — keeps callers off the alphatab chunk in
 * read-only flows that never serialize.
 */
import type { model } from "@coderline/alphatab";

export async function serializeScoreToAlphatex(
  score: model.Score
): Promise<string> {
  const mod = await import("@coderline/alphatab");
  const exporter = new mod.exporter.AlphaTexExporter();
  return exporter.exportToString(score);
}
