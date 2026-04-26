import { describe, it, expect } from "vitest";
import {
  detectUnlinkedMentions,
  convertMention,
  stripWikiLinks,
} from "./unlinkedMentions";

describe("stripWikiLinks", () => {
  it("removes [[link]] blocks", () => {
    expect(stripWikiLinks("Hello [[Service]] world")).toBe("Hello  world");
  });

  it("preserves text outside links", () => {
    expect(stripWikiLinks("Plain text only")).toBe("Plain text only");
  });
});

describe("detectUnlinkedMentions", () => {
  const allFilePaths = [
    "Service.md",
    "Auth.md",
    "Diagram.json",
    "notes/Other.md",
  ];

  it("returns empty for empty content", () => {
    expect(
      detectUnlinkedMentions({ content: "", allFilePaths }),
    ).toEqual([]);
  });

  it("detects an unwrapped basename token", () => {
    const result = detectUnlinkedMentions({
      content: "The Service handles requests.",
      allFilePaths,
    });
    expect(result.length).toBe(1);
    expect(result[0].token).toBe("Service");
    expect(result[0].targetPath).toBe("Service.md");
    expect(result[0].targetBasename).toBe("Service");
    expect(result[0].count).toBe(1);
  });

  it("counts multiple occurrences of the same token", () => {
    const result = detectUnlinkedMentions({
      content: "Service A and Service B both call Service.",
      allFilePaths,
    });
    expect(result[0].count).toBe(3);
  });

  it("ignores tokens already inside [[...]] links", () => {
    const result = detectUnlinkedMentions({
      content: "[[Service]] and [[Service|alias]] are linked.",
      allFilePaths,
    });
    expect(result.length).toBe(0);
  });

  it("excludes the current document's own basename", () => {
    const result = detectUnlinkedMentions({
      content: "I am Service writing about Service.",
      allFilePaths,
      currentPath: "Service.md",
    });
    expect(result).toEqual([]);
  });

  it("excludes common-word stoplist", () => {
    const result = detectUnlinkedMentions({
      content: "this that with from have your their would could about there",
      allFilePaths,
    });
    expect(result).toEqual([]);
  });

  it("excludes tokens shorter than 4 chars", () => {
    const allFilePaths = ["X.md", "ab.md", "foo.md", "alpha.md"];
    const result = detectUnlinkedMentions({
      content: "X ab foo alpha",
      allFilePaths,
    });
    expect(result.map((r) => r.token)).toEqual(["alpha"]);
  });

  it("matches case-insensitively but reports the cased token", () => {
    const result = detectUnlinkedMentions({
      content: "the service is up",
      allFilePaths,
    });
    expect(result[0].token).toBe("service");
    expect(result[0].targetBasename).toBe("Service");
  });

  it("caps results at the supplied cap", () => {
    const paths = Array.from({ length: 80 }, (_, i) => `note${i + 1000}.md`);
    const content = paths.map((p) => p.replace(".md", "")).join(" ");
    const result = detectUnlinkedMentions({
      content,
      allFilePaths: paths,
      cap: 10,
    });
    expect(result.length).toBe(10);
  });

  it("sorts by count desc then alphabetically", () => {
    const result = detectUnlinkedMentions({
      content: "Service Service Auth",
      allFilePaths,
    });
    expect(result.map((r) => r.token)).toEqual(["Service", "Auth"]);
  });

  it("matches diagram (.json) basenames", () => {
    const result = detectUnlinkedMentions({
      content: "See the Diagram for details.",
      allFilePaths,
    });
    expect(result[0].targetPath).toBe("Diagram.json");
  });
});

describe("convertMention", () => {
  it("wraps every unlinked occurrence in [[basename]]", () => {
    const out = convertMention(
      "Service A and Service B share Service.",
      "Service",
      "Service",
    );
    expect(out).toBe("[[Service]] A and [[Service]] B share [[Service]].");
  });

  it("does NOT touch occurrences already inside [[...]]", () => {
    const out = convertMention(
      "[[Service]] and Service alongside [[Service|alias]].",
      "Service",
      "Service",
    );
    expect(out).toBe("[[Service]] and [[Service]] alongside [[Service|alias]].");
  });

  it("respects word boundaries (does not match substrings)", () => {
    const out = convertMention(
      "Services use Service",
      "Service",
      "Service",
    );
    expect(out).toBe("Services use [[Service]]");
  });

  it("is case-insensitive", () => {
    const out = convertMention(
      "the service is up",
      "service",
      "Service",
    );
    expect(out).toBe("the [[Service]] is up");
  });

  it("returns input unchanged when no matches", () => {
    expect(convertMention("nothing here", "Service", "Service")).toBe("nothing here");
  });
});
