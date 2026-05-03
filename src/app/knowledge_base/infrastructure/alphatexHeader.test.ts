import { describe, it, expect } from "vitest";
import { parseAlphatexHeader } from "./alphatexHeader";

describe("parseAlphatexHeader", () => {
  it("extracts title, artist, key, tempo, tuning, track names, lyrics", () => {
    const src = `
\\title "Wonderwall"
\\artist "Oasis"
\\album "Morning Glory"
\\tempo 87
\\key "F# minor"
\\tuning E5 B4 G4 D4 A3 E3
\\track "Acoustic"
\\track "Lead"
\\lyrics "Today is gonna be the day"

. r.4 r.4 |
`;
    const out = parseAlphatexHeader(src);
    expect(out).toEqual({
      title: "Wonderwall",
      artist: "Oasis",
      album: "Morning Glory",
      key: "F# minor",
      tempo: 87,
      tuning: ["E5", "B4", "G4", "D4", "A3", "E3"],
      trackNames: ["Acoustic", "Lead"],
      lyrics: "Today is gonna be the day",
      references: [],
    });
  });

  it("returns empty defaults when directives are missing", () => {
    const out = parseAlphatexHeader(". r.4 |");
    expect(out).toEqual({
      title: "",
      tuning: [],
      trackNames: [],
      references: [],
    });
  });

  it("captures wiki-link tokens from a // references: comment line", () => {
    const src = `\\title "X"\n// references: [[a-doc.md]] [[diagrams/topo.json]] [[notes#section]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual([
      "a-doc.md",
      "diagrams/topo.json",
      "notes#section",
    ]);
  });

  it("ignores // lines that aren't `// references:`", () => {
    const src = `\\title "X"\n// some other comment [[ignored.md]]\n// references: [[real.md]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual(["real.md"]);
  });

  it("trims surrounding whitespace inside reference tokens", () => {
    const src = `\\title "X"\n// references:   [[ a.md ]]   [[b.md|Display]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual(["a.md", "b.md|Display"]);
  });

  it("tolerates Windows line endings", () => {
    const src = `\\title "X"\r\n\\artist "Y"\r\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.title).toBe("X");
    expect(out.artist).toBe("Y");
  });

  it("strips inline trailing comments from directive lines", () => {
    const src = `\\title "X" // tracking comment\n. r.4 |`;
    expect(parseAlphatexHeader(src).title).toBe("X");
  });

  it("collects multiple \\track directives in source order", () => {
    const src = `\\title "X"\n\\track "Bass"\n\\track "Drums"\n\\track "Guitar"\n. r.4 |`;
    expect(parseAlphatexHeader(src).trackNames).toEqual(["Bass", "Drums", "Guitar"]);
  });

  it("accepts single-quoted directive values (alphaTex parser docs use them)", () => {
    const src = `\\title 'Wonderwall'\n\\artist 'Oasis'\n\\track 'Acoustic'\n\\lyrics 'Today'\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.title).toBe("Wonderwall");
    expect(out.artist).toBe("Oasis");
    expect(out.trackNames).toEqual(["Acoustic"]);
    expect(out.lyrics).toBe("Today");
  });
});
