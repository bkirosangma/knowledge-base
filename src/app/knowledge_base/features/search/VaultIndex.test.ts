import { describe, it, expect } from "vitest";
import { VaultIndex } from "./VaultIndex";

describe("VaultIndex — basics", () => {
  it("SEARCH-1.2-01: addDoc registers a doc and indexes its body", () => {
    const idx = new VaultIndex();
    idx.addDoc("notes/a.md", "doc", { body: "alpha bravo charlie" });
    const r = idx.query("alpha");
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe("notes/a.md");
    expect(r[0].kind).toBe("doc");
    expect(r[0].fieldHits.some((h) => h.field === "body")).toBe(true);
  });

  it("SEARCH-1.2-02: addDoc is idempotent on the same path", () => {
    const idx = new VaultIndex();
    idx.addDoc("notes/a.md", "doc", { body: "alpha alpha alpha" });
    idx.addDoc("notes/a.md", "doc", { body: "alpha alpha alpha" });
    const r = idx.query("alpha");
    expect(r).toHaveLength(1);
    // 3 occurrences (not 6) because re-add replaces the previous entry.
    expect(r[0].score).toBe(3);
  });

  it("SEARCH-1.2-03: removeDoc clears all postings for the path", () => {
    const idx = new VaultIndex();
    idx.addDoc("a.md", "doc", { body: "alpha" });
    idx.addDoc("b.md", "doc", { body: "alpha bravo" });
    idx.removeDoc("a.md");
    const paths = idx.query("alpha").map((r) => r.path);
    expect(paths).toEqual(["b.md"]);
    expect(idx.has("a.md")).toBe(false);
    expect(idx.has("b.md")).toBe(true);
  });

  it("SEARCH-1.2-04: query AND-of-tokens", () => {
    const idx = new VaultIndex();
    idx.addDoc("both.md", "doc", { body: "alpha and bravo" });
    idx.addDoc("alpha.md", "doc", { body: "alpha only" });
    idx.addDoc("bravo.md", "doc", { body: "bravo only" });
    const paths = idx.query("alpha bravo").map((r) => r.path);
    expect(paths).toEqual(["both.md"]);
  });

  it("SEARCH-1.2-05: query prefix-matches the last token only", () => {
    const idx = new VaultIndex();
    idx.addDoc("alpha.md", "doc", { body: "alpha" });
    idx.addDoc("alphabet.md", "doc", { body: "alphabet" });
    idx.addDoc("apple.md", "doc", { body: "apple" });

    // "alp" prefix-matches alpha + alphabet, not apple
    const paths = idx.query("alp").map((r) => r.path).sort();
    expect(paths).toEqual(["alpha.md", "alphabet.md"]);

    // Non-final tokens are exact, last token is prefix: "alpha alp" requires
    // a doc to contain the token "alpha" exactly AND a token starting with
    // "alp" (which alpha itself satisfies). alphabet.md doesn't have a
    // token "alpha" — only "alphabet" — so it's filtered out.
    expect(idx.query("alpha alp").map((r) => r.path)).toEqual(["alpha.md"]);

    // First token must match exactly: "alp alpha" — no doc contains the
    // exact token "alp", so the result is empty.
    expect(idx.query("alp alpha")).toEqual([]);
  });

  it("SEARCH-1.2-06: diagram fields tagged distinctly", () => {
    const idx = new VaultIndex();
    idx.addDoc("d.json", "diagram", {
      title: "topology",
      layerTitles: ["frontend"],
      nodeLabels: ["alpha service"],
      flowNames: ["alpha flow"],
    });
    const r = idx.query("alpha");
    expect(r).toHaveLength(1);
    const fields = new Set(r[0].fieldHits.map((h) => h.field));
    expect(fields.has("label")).toBe(true);
    expect(fields.has("flow")).toBe(true);

    const tr = idx.query("topology");
    expect(tr[0].fieldHits.some((h) => h.field === "title")).toBe(true);

    const lr = idx.query("frontend");
    expect(lr[0].fieldHits.some((h) => h.field === "title")).toBe(true);
  });

  it("SEARCH-1.2-07: snippet around first body hit has ±40 char radius", () => {
    const body = "lorem ipsum dolor sit amet, consectetur adipiscing elit. alpha is here. sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
    const idx = new VaultIndex();
    idx.addDoc("a.md", "doc", { body });
    const r = idx.query("alpha");
    expect(r).toHaveLength(1);
    expect(r[0].snippet).toContain("alpha");
    // Body has plenty of context on either side of the hit, so both
    // ellipses should appear.
    expect(r[0].snippet.startsWith("…")).toBe(true);
    expect(r[0].snippet.endsWith("…")).toBe(true);
    // Snippet length: 2*40 chars + 2 ellipses = 82 max.
    expect(r[0].snippet.length).toBeLessThanOrEqual(82);
  });

  it("SEARCH-1.2-07b: snippet falls back to non-body field when no body match", () => {
    const idx = new VaultIndex();
    idx.addDoc("d.json", "diagram", {
      nodeLabels: ["alpha service", "beta service", "gamma service"],
    });
    const r = idx.query("beta");
    expect(r).toHaveLength(1);
    expect(r[0].snippet).toContain("beta");
  });

  it("SEARCH-1.2-08: size() reflects registered docs", () => {
    const idx = new VaultIndex();
    expect(idx.size()).toBe(0);
    idx.addDoc("a.md", "doc", { body: "x" });
    idx.addDoc("b.md", "doc", { body: "y" });
    expect(idx.size()).toBe(2);
    idx.removeDoc("a.md");
    expect(idx.size()).toBe(1);
  });

  it("SEARCH-1.2-09: clear() empties the index", () => {
    const idx = new VaultIndex();
    idx.addDoc("a.md", "doc", { body: "alpha" });
    idx.addDoc("b.md", "doc", { body: "alpha" });
    idx.clear();
    expect(idx.size()).toBe(0);
    expect(idx.query("alpha")).toEqual([]);
  });

  it("query on empty input returns []", () => {
    const idx = new VaultIndex();
    idx.addDoc("a.md", "doc", { body: "alpha" });
    expect(idx.query("")).toEqual([]);
    expect(idx.query("   ")).toEqual([]);
  });

  it("query returns empty when no docs match", () => {
    const idx = new VaultIndex();
    idx.addDoc("a.md", "doc", { body: "alpha" });
    expect(idx.query("zzzzz")).toEqual([]);
  });

  it("results ordered by score desc and limit honoured", () => {
    const idx = new VaultIndex();
    idx.addDoc("once.md", "doc", { body: "alpha" });
    idx.addDoc("triple.md", "doc", { body: "alpha alpha alpha" });
    idx.addDoc("double.md", "doc", { body: "alpha alpha" });
    const r = idx.query("alpha");
    expect(r.map((x) => x.path)).toEqual(["triple.md", "double.md", "once.md"]);
    expect(idx.query("alpha", 2)).toHaveLength(2);
  });
});

describe("VaultIndex — performance (SEARCH-1.4-01)", () => {
  // 200-doc synthetic vault. Median query latency must stay under 50 ms.
  // Builds the corpus programmatically so the perf check doesn't depend
  // on committed fixture files.
  it("median query latency < 50 ms on 200 docs", () => {
    const idx = new VaultIndex();
    for (let i = 0; i < 200; i++) {
      idx.addDoc(`docs/file-${i}.md`, "doc", { body: synthBody(i) });
    }

    const queries = [
      "alpha",       // common single token
      "alp",         // prefix on the common token
      "alpha bravo", // AND-of-tokens
      "rare",        // common-but-rarer token
      "uniq",        // prefix on per-doc-distinct strings
    ];

    // Warm the JIT.
    for (let i = 0; i < 3; i++) idx.query(queries[i % queries.length]);

    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const q = queries[i % queries.length];
      const t0 = performance.now();
      idx.query(q);
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    expect(median).toBeLessThan(50);
  });
});

const SHARED = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "rare", "common", "lorem", "ipsum"];
const FILLER = [
  "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod",
  "tempor", "incididunt", "labore", "magna", "aliqua", "ut", "enim",
  "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco",
  "laboris", "nisi", "aliquip", "commodo", "consequat", "duis", "aute",
];

function synthBody(seed: number): string {
  const words: string[] = [];
  for (let j = 0; j < 200; j++) {
    if (j % 6 === 0) words.push(SHARED[(seed + j) % SHARED.length]);
    else if (j % 11 === 0) words.push(`unique${seed}${j}`);
    else words.push(FILLER[(seed * 17 + j) % FILLER.length]);
  }
  return words.join(" ");
}
