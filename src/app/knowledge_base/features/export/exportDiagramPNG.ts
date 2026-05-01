// Diagram → PNG (KB-011 / EXPORT-9.2).
//
// Wraps the SVG export, rasterises via an offscreen canvas at a scale
// that guarantees ≥ 1500 px output width.

import type { DiagramData } from "../../shared/utils/types";
import { exportDiagramSVG } from "./exportDiagramSVG";

const MIN_PNG_WIDTH = 1500;
const BASE_SCALE = 2;

/** Result of `rasterizeSVG`. Provided as a Blob so callers can either
 *  download via `URL.createObjectURL` or attach it to a paste/clipboard
 *  flow without a re-encode. */
export interface PngExport {
  blob: Blob;
  width: number;
  height: number;
}

/** Pure helper that rasterises an SVG string. Exported so tests can
 *  exercise the canvas/blob pipeline against a fixed input without
 *  driving the diagram-data → SVG conversion every time. */
export async function rasterizeSVG(svg: string): Promise<PngExport> {
  const url = svgToObjectURL(svg);
  try {
    const img = await loadImage(url);
    const intrinsicW = img.naturalWidth || parseSvgIntrinsicWidth(svg);
    const intrinsicH = img.naturalHeight || parseSvgIntrinsicHeight(svg);
    const scale = Math.max(BASE_SCALE, MIN_PNG_WIDTH / Math.max(1, intrinsicW));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(intrinsicW * scale);
    canvas.height = Math.ceil(intrinsicH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to acquire 2D rendering context");
    // Draw at the canvas size; the source `<img>` carries the SVG at its
    // intrinsic resolution, so passing the canvas dimensions to drawImage
    // upscales cleanly without aliasing.
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas.toBlob produced no output"));
      }, "image/png");
    });
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Build a PNG from a `DiagramData` value. Convenience wrapper for the
 *  ExportMenu — composes `exportDiagramSVG` + `rasterizeSVG`. */
export async function exportDiagramPNG(doc: DiagramData): Promise<PngExport> {
  const svg = exportDiagramSVG(doc);
  return rasterizeSVG(svg);
}

// ─── Internals ────────────────────────────────────────────────────────

function svgToObjectURL(svg: string): string {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  return URL.createObjectURL(blob);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load SVG into <img>: ${String(e)}`));
    img.src = url;
  });
}

/** Best-effort parse of the SVG's intrinsic width so we can scale even
 *  when the browser's `<img>` reports 0 (some browsers do that for
 *  SVGs without a width attribute). The exporter always emits both
 *  `viewBox` and `width`, so this just reads the latter. */
function parseSvgIntrinsicWidth(svg: string): number {
  const m = /<svg[^>]*\swidth="([^"]+)"/.exec(svg);
  return m ? parseFloat(m[1]) || 0 : 0;
}

function parseSvgIntrinsicHeight(svg: string): number {
  const m = /<svg[^>]*\sheight="([^"]+)"/.exec(svg);
  return m ? parseFloat(m[1]) || 0 : 0;
}
