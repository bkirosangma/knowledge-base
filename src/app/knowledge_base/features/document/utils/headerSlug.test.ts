import { describe, it, expect } from "vitest";
import { headerSlug } from "./headerSlug";

describe("headerSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(headerSlug("My Header")).toBe("my-header");
  });
  it("strips punctuation", () => {
    expect(headerSlug("What's the deal?")).toBe("whats-the-deal");
  });
  it("collapses whitespace runs", () => {
    expect(headerSlug("Foo   Bar")).toBe("foo-bar");
  });
  it("strips leading/trailing hyphens", () => {
    expect(headerSlug("  Hello  ")).toBe("hello");
  });
  it("de-accents", () => {
    expect(headerSlug("Café Résumé")).toBe("cafe-resume");
  });
  it("stable across repeats — idempotent", () => {
    expect(headerSlug("Foo")).toBe(headerSlug("foo"));
  });
});
