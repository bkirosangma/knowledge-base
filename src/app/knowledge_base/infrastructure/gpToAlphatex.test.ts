import { describe, it, expect, vi, beforeEach } from "vitest";

const loadScoreFromBytesMock = vi.fn();
const exportToStringMock = vi.fn();

vi.mock("@coderline/alphatab", () => ({
  importer: {
    ScoreLoader: {
      loadScoreFromBytes: loadScoreFromBytesMock,
    },
  },
  exporter: {
    AlphaTexExporter: class {
      exportToString = exportToStringMock;
    },
  },
}));

import { gpToAlphatex } from "./gpToAlphatex";

describe("gpToAlphatex", () => {
  beforeEach(() => {
    loadScoreFromBytesMock.mockReset();
    exportToStringMock.mockReset();
  });

  it("loads bytes via ScoreLoader then exports via AlphaTexExporter", async () => {
    const fakeScore = { title: "Test" };
    loadScoreFromBytesMock.mockReturnValue(fakeScore);
    exportToStringMock.mockReturnValue("\\title \"Test\"\n.");

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await gpToAlphatex(bytes);

    expect(loadScoreFromBytesMock).toHaveBeenCalledTimes(1);
    expect(loadScoreFromBytesMock).toHaveBeenCalledWith(bytes);
    expect(exportToStringMock).toHaveBeenCalledTimes(1);
    expect(exportToStringMock).toHaveBeenCalledWith(fakeScore);
    expect(result).toBe("\\title \"Test\"\n.");
  });

  it("propagates ScoreLoader errors as-is", async () => {
    loadScoreFromBytesMock.mockImplementation(() => {
      throw new Error("Unsupported format");
    });
    const bytes = new Uint8Array([0, 0, 0, 0]);
    await expect(gpToAlphatex(bytes)).rejects.toThrow("Unsupported format");
    expect(exportToStringMock).not.toHaveBeenCalled();
  });

  it("propagates AlphaTexExporter errors as-is", async () => {
    loadScoreFromBytesMock.mockReturnValue({ title: "Bad" });
    exportToStringMock.mockImplementation(() => {
      throw new Error("Export failed");
    });
    await expect(gpToAlphatex(new Uint8Array([1]))).rejects.toThrow("Export failed");
  });
});
