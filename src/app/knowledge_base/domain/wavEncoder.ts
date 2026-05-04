const RIFF_HEADER_SIZE = 44;

function writeAscii(view: DataView, off: number, ascii: string): void {
  for (let i = 0; i < ascii.length; i++) view.setUint8(off + i, ascii.charCodeAt(i));
}

export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
  channels: number,
): Uint8Array {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;
  const dataSize = totalSamples * 2; // 16-bit PCM = 2 bytes/sample
  const out = new Uint8Array(RIFF_HEADER_SIZE + dataSize);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, /* littleEndian */ true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);                                 // fmt subchunk size
  view.setUint16(20, 1, true);                                  // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);          // byte rate
  view.setUint16(32, channels * 2, true);                       // block align
  view.setUint16(34, 16, true);                                 // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]!));
      // Symmetric: clamp -1.0 to -0x7fff (not -0x8000) so endpoints round-trip cleanly
      const int16 = Math.round(s * 0x7fff);
      view.setInt16(off, int16, true);
      off += 2;
    }
  }
  return out;
}
