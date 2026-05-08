import { describe, it, expect } from "vitest";
import { filterSlashCommands, SLASH_COMMANDS, isSlashTrigger } from "./slashCommands";

describe("isSlashTrigger", () => {
  it("SLASH-13.2-01: matches /, /kb-style strings", () => {
    expect(isSlashTrigger("/")).toBe(true);
    expect(isSlashTrigger("/d")).toBe(true);
    expect(isSlashTrigger("/diagram")).toBe(true);
    expect(isSlashTrigger("/guitar-tabs")).toBe(true);
  });
  it("SLASH-13.2-02: rejects whitespace, leading text, mixed case", () => {
    expect(isSlashTrigger("hello /")).toBe(false);
    expect(isSlashTrigger("/Diagram")).toBe(false);
    expect(isSlashTrigger("/d ")).toBe(false);
    expect(isSlashTrigger("")).toBe(false);
  });
});

describe("filterSlashCommands", () => {
  it("SLASH-13.2-03: returns all on bare slash", () => {
    expect(filterSlashCommands("/")).toEqual(SLASH_COMMANDS);
  });
  it("SLASH-13.2-04: prefix matches subcommand id", () => {
    expect(filterSlashCommands("/d").map((c) => c.id)).toEqual(["diagram", "document"]);
  });
  it("SLASH-13.2-05: filter survives label substring", () => {
    expect(filterSlashCommands("/v").map((c) => c.id)).toEqual(["validate"]);
  });
  it("SLASH-13.2-06: returns empty when off-pattern", () => {
    expect(filterSlashCommands("hello")).toEqual([]);
    expect(filterSlashCommands("/d ")).toEqual([]);
  });
});
