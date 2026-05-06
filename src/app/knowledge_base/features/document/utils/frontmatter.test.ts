import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter";

describe("parseFrontmatter — no frontmatter", () => {
  it("returns body verbatim when there is no frontmatter", () => {
    const text = "# Body";
    const r = parseFrontmatter(text);
    expect(r.data).toEqual({});
    expect(r.rawYaml).toBeNull();
    expect(r.body).toBe("# Body");
  });

  it("treats a non-leading `---` as ordinary body", () => {
    const text = "# Body\n---\nfoo";
    const r = parseFrontmatter(text);
    expect(r.data).toEqual({});
    expect(r.rawYaml).toBeNull();
    expect(r.body).toBe(text);
  });

  it("treats unclosed leading `---` as malformed (no frontmatter)", () => {
    const text = "---\nfoo\n# Body";
    const r = parseFrontmatter(text);
    expect(r.data).toEqual({});
    expect(r.rawYaml).toBeNull();
    expect(r.body).toBe(text);
  });
});

describe("parseFrontmatter — sources only", () => {
  it("parses a block list of sources with url + title", () => {
    const text =
      "---\n" +
      "sources:\n" +
      "  - url: 'https://example.com'\n" +
      "    title: 'Example'\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([
      { url: "https://example.com", title: "Example" },
      { url: "https://x.com" },
    ]);
    expect(r.rawYaml).toBe("");
    expect(r.body).toBe("# Body");
  });

  it("accepts unquoted url scalars", () => {
    const text =
      "---\n" +
      "sources:\n" +
      "  - url: https://example.com\n" +
      "    title: Example\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([
      { url: "https://example.com", title: "Example" },
    ]);
  });
});

describe("parseFrontmatter — sources + unknown keys", () => {
  it("preserves unknown scalars in rawYaml", () => {
    const text =
      "---\n" +
      "tags: foo\n" +
      "sources:\n" +
      "  - url: 'https://example.com'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([{ url: "https://example.com" }]);
    expect(r.rawYaml).toBe("tags: foo");
    expect(r.body).toBe("# Body");
  });

  it("preserves multiple unknown keys including inline lists", () => {
    const text =
      "---\n" +
      "title: My Doc\n" +
      "tags: [a, b, c]\n" +
      "sources:\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "body";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([{ url: "https://x.com" }]);
    expect(r.rawYaml).toBe("title: My Doc\ntags: [a, b, c]");
  });
});

describe("parseFrontmatter — empty frontmatter", () => {
  it("returns empty data and empty rawYaml when fences contain nothing", () => {
    const text = "---\n---\n# Body";
    const r = parseFrontmatter(text);
    expect(r.data).toEqual({});
    expect(r.rawYaml).toBe("");
    expect(r.body).toBe("# Body");
  });
});

describe("serializeFrontmatter", () => {
  it("returns body verbatim when no sources and no rawYaml", () => {
    const out = serializeFrontmatter({ data: {}, rawYaml: null, body: "# Body" });
    expect(out).toBe("# Body");
  });

  it("emits a sources block when sources are present", () => {
    const out = serializeFrontmatter({
      data: { sources: [{ url: "https://example.com", title: "Example" }] },
      rawYaml: null,
      body: "# Body",
    });
    expect(out).toBe(
      "---\n" +
        "sources:\n" +
        "  - url: 'https://example.com'\n" +
        "    title: 'Example'\n" +
        "---\n" +
        "# Body",
    );
  });

  it("emits rawYaml lines before sources", () => {
    const out = serializeFrontmatter({
      data: { sources: [{ url: "https://x.com" }] },
      rawYaml: "tags: foo",
      body: "body",
    });
    expect(out).toBe(
      "---\n" +
        "tags: foo\n" +
        "sources:\n" +
        "  - url: 'https://x.com'\n" +
        "---\n" +
        "body",
    );
  });

  it("omits the title line when title is empty", () => {
    const out = serializeFrontmatter({
      data: { sources: [{ url: "https://x.com", title: "" }] },
      body: "",
    });
    expect(out).toContain("- url: 'https://x.com'");
    expect(out).not.toContain("title:");
  });
});

describe("round-trip stability", () => {
  it("no frontmatter round-trips", () => {
    const text = "# Body";
    const r = parseFrontmatter(text);
    const out = serializeFrontmatter({ data: r.data, rawYaml: r.rawYaml, body: r.body });
    expect(out).toBe(text);
  });

  it("sources-only round-trips", () => {
    const text =
      "---\n" +
      "sources:\n" +
      "  - url: 'https://example.com'\n" +
      "    title: 'Example'\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    const out = serializeFrontmatter({ data: r.data, rawYaml: r.rawYaml, body: r.body });
    expect(out).toBe(text);
  });

  it("sources + unknown rawYaml round-trips", () => {
    const text =
      "---\n" +
      "tags: foo\n" +
      "sources:\n" +
      "  - url: 'https://example.com'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    const out = serializeFrontmatter({ data: r.data, rawYaml: r.rawYaml, body: r.body });
    expect(out).toBe(text);
  });

  it("serializer output is a fixed point under parse → serialize", () => {
    const fixture = serializeFrontmatter({
      data: { sources: [{ url: "https://example.com", title: "Example" }] },
      rawYaml: "tags: [a, b]",
      body: "# Body\n",
    });
    const reparsed = parseFrontmatter(fixture);
    const reserialized = serializeFrontmatter({
      data: reparsed.data,
      rawYaml: reparsed.rawYaml,
      body: reparsed.body,
    });
    expect(reserialized).toBe(fixture);
  });
});

describe("mutating the parsed shape", () => {
  it("adding sources to a body-only file produces a frontmatter block", () => {
    const text = "# Body";
    const r = parseFrontmatter(text);
    const out = serializeFrontmatter({
      data: { sources: [{ url: "https://x.com" }] },
      rawYaml: r.rawYaml,
      body: r.body,
    });
    expect(out).toBe(
      "---\n" +
        "sources:\n" +
        "  - url: 'https://x.com'\n" +
        "---\n" +
        "# Body",
    );
  });

  it("clearing sources on a sources-only file produces a body-only file", () => {
    const text =
      "---\n" +
      "sources:\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    const out = serializeFrontmatter({
      data: { sources: [] },
      rawYaml: null,
      body: r.body,
    });
    expect(out).toBe("# Body");
  });
});

describe("YAML quoting / escaping", () => {
  it("preserves apostrophes via doubled-single-quote escaping", () => {
    const text =
      "---\n" +
      "sources:\n" +
      "  - url: 'https://example.com'\n" +
      "    title: 'O''Reilly'\n" +
      "---\n" +
      "# Body";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([
      { url: "https://example.com", title: "O'Reilly" },
    ]);
    const out = serializeFrontmatter({ data: r.data, rawYaml: r.rawYaml, body: r.body });
    expect(out).toBe(text);
  });

  it("preserves URL-significant characters (?, &, =, %, :)", () => {
    const url = "https://example.com/search?q=foo&lang=en%20us#frag";
    const r = parseFrontmatter(
      "---\n" +
        "sources:\n" +
        `  - url: '${url}'\n` +
        "---\n" +
        "body",
    );
    expect(r.data.sources).toEqual([{ url }]);
    const out = serializeFrontmatter({ data: r.data, rawYaml: r.rawYaml, body: r.body });
    expect(out).toContain(`'${url}'`);
  });
});

describe("normalization — CRLF and BOM", () => {
  it("normalizes CRLF input and parses sources correctly", () => {
    const text =
      "---\r\n" +
      "sources:\r\n" +
      "  - url: 'https://x.com'\r\n" +
      "---\r\n" +
      "# Body\r\n";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([{ url: "https://x.com" }]);
    expect(r.body).toBe("# Body\n");
    expect(r.rawYaml).toBe("");
  });

  it("serialized CRLF input produces LF-only output (fixed point)", () => {
    const crlfInput =
      "---\r\n" +
      "sources:\r\n" +
      "  - url: 'https://x.com'\r\n" +
      "---\r\n" +
      "# Body\r\n";
    const parsed = parseFrontmatter(crlfInput);
    const serialized = serializeFrontmatter({
      data: parsed.data,
      rawYaml: parsed.rawYaml,
      body: parsed.body,
    });
    // Output should be LF-only (the normalized form).
    const expectedLf =
      "---\n" +
      "sources:\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "# Body\n";
    expect(serialized).toBe(expectedLf);
    // Re-parsing the serialized form is a fixed point.
    const reparsed = parseFrontmatter(serialized);
    const reserialized = serializeFrontmatter({
      data: reparsed.data,
      rawYaml: reparsed.rawYaml,
      body: reparsed.body,
    });
    expect(reserialized).toBe(expectedLf);
  });

  it("strips leading UTF-8 BOM and parses sources", () => {
    const text =
      "﻿---\n" +
      "sources:\n" +
      "  - url: 'https://x.com'\n" +
      "---\n" +
      "# Body\n";
    const r = parseFrontmatter(text);
    expect(r.data.sources).toEqual([{ url: "https://x.com" }]);
    expect(r.body).toBe("# Body\n");
    // BOM is gone from the body.
    expect(r.body).not.toContain("﻿");
  });
});
