/**
 * Converts Guitar Pro file bytes to AlphaTex notation string.
 *
 * Uses a lazy dynamic import of `@coderline/alphatab` so the heavy
 * library is only loaded when actually needed (avoids bloating the
 * initial bundle).
 *
 * @param bytes - Raw bytes of a Guitar Pro file (.gp, .gp4, .gp5, etc.)
 * @returns AlphaTex string representation of the score
 * @throws If the bytes cannot be parsed or the export fails
 */
export async function gpToAlphatex(bytes: Uint8Array): Promise<string> {
  const mod = await import("@coderline/alphatab");
  const score = mod.importer.ScoreLoader.loadScoreFromBytes(bytes);
  const exporter = new mod.exporter.AlphaTexExporter();
  return exporter.exportToString(score);
}
