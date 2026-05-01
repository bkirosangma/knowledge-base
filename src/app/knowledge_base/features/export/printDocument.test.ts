import { describe, it, expect, vi, beforeEach } from "vitest";
import { printDocument } from "./printDocument";

describe("printDocument (EXPORT-9.3)", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-printing");
  });

  it("EXPORT-9.3-01: sets body[data-printing=document] and calls window.print", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument();
    expect(document.body.getAttribute("data-printing")).toBe("document");
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });

  it("EXPORT-9.3-04: clears the attribute on the afterprint event", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument();
    expect(document.body.getAttribute("data-printing")).toBe("document");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.body.getAttribute("data-printing")).toBeNull();
    printSpy.mockRestore();
  });

  it("returns a cleanup that clears the attribute when the print dialog never fires afterprint", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const cleanup = printDocument();
    expect(document.body.getAttribute("data-printing")).toBe("document");
    cleanup();
    expect(document.body.getAttribute("data-printing")).toBeNull();
    printSpy.mockRestore();
  });

  it("if window.print throws, attribute is still cleared", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => printDocument()).not.toThrow();
    expect(document.body.getAttribute("data-printing")).toBeNull();
    printSpy.mockRestore();
  });
});
