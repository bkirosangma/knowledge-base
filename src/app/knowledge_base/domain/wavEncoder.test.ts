import { describe, it, expect } from "vitest";
import { encodeWav } from "./wavEncoder";

function readUint32LE(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) >>> 0;
}
function readUint16LE(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8)) & 0xffff;
}
function readInt16LE(bytes: Uint8Array, off: number): number {
  const u = readUint16LE(bytes, off);
  return u >= 0x8000 ? u - 0x10000 : u;
}

describe("encodeWav", () => {
  it("writes a valid RIFF/WAVE/fmt /data header for an empty payload", () => {
    const out = encodeWav([], 44100, 2);
    expect(out.length).toBe(44);
    expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...out.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...out.slice(12, 16))).toBe("fmt ");
    expect(String.fromCharCode(...out.slice(36, 40))).toBe("data");
    expect(readUint32LE(out, 16)).toBe(16);          // fmt subchunk size
    expect(readUint16LE(out, 20)).toBe(1);           // PCM format
    expect(readUint16LE(out, 22)).toBe(2);           // channels
    expect(readUint32LE(out, 24)).toBe(44100);       // sample rate
    expect(readUint32LE(out, 28)).toBe(44100 * 2 * 2); // byte rate
    expect(readUint16LE(out, 32)).toBe(4);           // block align
    expect(readUint16LE(out, 34)).toBe(16);          // bits per sample
    expect(readUint32LE(out, 40)).toBe(0);           // data subchunk size = 0
    expect(readUint32LE(out, 4)).toBe(36);           // RIFF size = 36 + data size
  });

  it("converts Float32 samples to 16-bit PCM with full-scale boundaries", () => {
    const out = encodeWav([new Float32Array([0, 1, -1, 0.5, -0.5])], 44100, 1);
    expect(readUint32LE(out, 40)).toBe(5 * 2);        // 5 samples × 2 bytes
    expect(readInt16LE(out, 44)).toBe(0);
    expect(readInt16LE(out, 46)).toBe(0x7fff);        // +1.0 → 0x7fff
    expect(readInt16LE(out, 48)).toBe(-0x7fff);       // −1.0 → −0x7fff (clamped)
    expect(readInt16LE(out, 50)).toBe(Math.round(0.5 * 0x7fff));
    expect(readInt16LE(out, 52)).toBe(Math.round(-0.5 * 0x7fff));
  });

  it("clamps Float32 outside [-1, 1]", () => {
    const out = encodeWav([new Float32Array([1.5, -1.5, 2, -2])], 44100, 1);
    expect(readInt16LE(out, 44)).toBe(0x7fff);
    expect(readInt16LE(out, 46)).toBe(-0x7fff);
    expect(readInt16LE(out, 48)).toBe(0x7fff);
    expect(readInt16LE(out, 50)).toBe(-0x7fff);
  });

  it("concatenates multiple chunks in order", () => {
    const a = new Float32Array([0.25, 0.5]);
    const b = new Float32Array([-0.25]);
    const out = encodeWav([a, b], 22050, 1);
    expect(readUint32LE(out, 40)).toBe(3 * 2);
    expect(readInt16LE(out, 44)).toBe(Math.round(0.25 * 0x7fff));
    expect(readInt16LE(out, 46)).toBe(Math.round(0.5 * 0x7fff));
    expect(readInt16LE(out, 48)).toBe(Math.round(-0.25 * 0x7fff));
  });

  it("respects the supplied sample rate and channel count", () => {
    const out = encodeWav([new Float32Array(0)], 48000, 1);
    expect(readUint32LE(out, 24)).toBe(48000);
    expect(readUint16LE(out, 22)).toBe(1);
    expect(readUint32LE(out, 28)).toBe(48000 * 1 * 2); // byte rate
    expect(readUint16LE(out, 32)).toBe(2);             // block align (1 ch × 2 bytes)
  });

  it("writes monotonically increasing data subchunk size", () => {
    const out = encodeWav([new Float32Array(100)], 44100, 2);
    // 100 samples (interleaved), 2 bytes each → 200 bytes
    expect(readUint32LE(out, 40)).toBe(200);
    expect(readUint32LE(out, 4)).toBe(36 + 200);
  });
});
