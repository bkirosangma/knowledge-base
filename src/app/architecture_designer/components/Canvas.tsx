import React from "react";

/** Size of one canvas unit in pixels */
export const CANVAS_UNIT = 800;

export interface CanvasPatch {
  id: string;
  /** Grid column (0-based) */
  col: number;
  /** Grid row (0-based) */
  row: number;
  /** Width in units */
  widthUnits: number;
  /** Height in units */
  heightUnits: number;
}

interface CanvasProps {
  /** All canvas patches in the world */
  patches: CanvasPatch[];
  /** Called when patches need to grow to fit content */
  onPatchesChange?: (patches: CanvasPatch[]) => void;
  children?: React.ReactNode;
}

/**
 * Computes the pixel bounds of a single patch.
 */
export function getPatchBounds(patch: CanvasPatch) {
  return {
    x: patch.col * CANVAS_UNIT,
    y: patch.row * CANVAS_UNIT,
    w: patch.widthUnits * CANVAS_UNIT,
    h: patch.heightUnits * CANVAS_UNIT,
  };
}

/**
 * Given a point (px, py), find which patch contains it, or null.
 */
export function findPatchAt(
  px: number,
  py: number,
  patches: CanvasPatch[]
): CanvasPatch | null {
  for (const p of patches) {
    const b = getPatchBounds(p);
    if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) {
      return p;
    }
  }
  return null;
}

/**
 * Fit patches to exactly cover the given content bounds, snapped to unit
 * boundaries. Grows AND shrinks as needed. Enforces a minimum size.
 */
export function fitToContent(
  patches: CanvasPatch[],
  bounds: { x: number; y: number; w: number; h: number },
  minWidthUnits = 1,
  minHeightUnits = 1,
): CanvasPatch[] {
  let changed = false;
  const result = patches.map((p) => {
    // Compute the unit-snapped bounding box that covers `bounds`
    const newCol = Math.floor(bounds.x / CANVAS_UNIT);
    const newRow = Math.floor(bounds.y / CANVAS_UNIT);
    const right = bounds.x + bounds.w;
    const bottom = bounds.y + bounds.h;
    let newW = Math.ceil(right / CANVAS_UNIT) - newCol;
    let newH = Math.ceil(bottom / CANVAS_UNIT) - newRow;

    // Enforce minimum size
    if (newW < minWidthUnits) newW = minWidthUnits;
    if (newH < minHeightUnits) newH = minHeightUnits;

    if (newCol === p.col && newRow === p.row && newW === p.widthUnits && newH === p.heightUnits) {
      return p;
    }
    changed = true;
    return { ...p, col: newCol, row: newRow, widthUnits: newW, heightUnits: newH };
  });

  return changed ? result : patches;
}

/**
 * Compute total world size from all patches.
 */
export function getWorldSize(patches: CanvasPatch[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of patches) {
    const b = getPatchBounds(p);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Canvas renders all patches as a tiled background.
 * Children (layers, elements, lines) are rendered on top.
 */
export default function Canvas({ patches, children }: CanvasProps) {
  const world = getWorldSize(patches);

  return (
    <div
      className="relative"
      style={{ width: world.w, height: world.h }}
    >
      {/* Render patch backgrounds */}
      {patches.map((patch) => {
        const b = getPatchBounds(patch);
        return (
          <div
            key={patch.id}
            className="absolute bg-white border border-slate-200"
            style={{
              left: b.x - world.x,
              top: b.y - world.y,
              width: b.w,
              height: b.h,
              backgroundImage:
                `linear-gradient(to right, #e2e8f0 1px, transparent 1px),
                 linear-gradient(to bottom, #e2e8f0 1px, transparent 1px),
                 linear-gradient(to right, #f1f5f9 1px, transparent 1px),
                 linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)`,
              backgroundSize: `${CANVAS_UNIT}px ${CANVAS_UNIT}px, ${CANVAS_UNIT}px ${CANVAS_UNIT}px, 10px 10px, 10px 10px`,
            }}
          />
        );
      })}
      {/* Content layer — offset so world coordinate (0,0) maps correctly */}
      <div className="absolute" style={{ left: -world.x, top: -world.y }}>
        {children}
      </div>
    </div>
  );
}
