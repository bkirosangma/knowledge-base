import { describe, it, expect } from "vitest";
import { serializeScoreToAlphatex } from "./alphaTexExporter";

const FIXTURE_ALPHATEX = `\\title "Smoke Test"\n\\tempo 120\n.\n:4 0.6 1.6 2.6 3.6 |`;

describe("serializeScoreToAlphatex", () => {
  it("round-trips a minimal score back to alphaTex", async () => {
    const mod = await import("@coderline/alphatab");
    const importer = new mod.importer.AlphaTexImporter();
    const settings = new mod.Settings();
    importer.init(mod.io.ByteBuffer.empty(), settings);
    importer.initFromString(FIXTURE_ALPHATEX, settings);
    const score = importer.readScore();

    const out = await serializeScoreToAlphatex(score);

    expect(out).toContain("Smoke Test");
    expect(out).toMatch(/0\.6/);
  });
});
