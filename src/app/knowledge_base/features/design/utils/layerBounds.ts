import type { LayerDef, NodeData, RegionBounds } from "../types";
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from "./constants";

export type { RegionBounds };

type ManualSizes = Record<string, { left?: number; width?: number; top?: number; height?: number }>;

/** Convert node extents to padded bounds and apply manual size overrides */
function extentsToBounds(
  minX: number, maxX: number, minY: number, maxY: number,
  layerId: string,
  layerManualSizes: ManualSizes,
): { left: number; top: number; width: number; height: number } {
  let left = minX - LAYER_PADDING;
  let width = maxX - minX + LAYER_PADDING * 2;
  let top = minY - LAYER_PADDING - LAYER_TITLE_OFFSET;
  let height = maxY - minY + LAYER_PADDING * 2 + LAYER_TITLE_OFFSET;

  const manual = layerManualSizes[layerId];
  if (manual) {
    if (manual.left !== undefined && manual.left < left) {
      width += left - manual.left;
      left = manual.left;
    }
    if (manual.width !== undefined && manual.width > width) {
      width = manual.width;
    }
    if (manual.top !== undefined && manual.top < top) {
      height += top - manual.top;
      top = manual.top;
    }
    if (manual.height !== undefined && manual.height > height) {
      height = manual.height;
    }
  }

  return { left, top, width, height };
}

/**
 * Predict what a layer's bounds would be after adding a hypothetical new node.
 * Mirrors the core loop of computeRegions for a single layer.
 */
export function predictLayerBounds(
  layerId: string,
  existingNodes: { id: string; x: number; y: number; w: number; layer: string }[],
  newNodeX: number,
  newNodeY: number,
  newNodeHalfW: number,
  newNodeHalfH: number,
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number },
  layerManualSizes: ManualSizes,
): { left: number; top: number; width: number; height: number } {
  const layerNodes = existingNodes.filter((n) => n.layer === layerId);

  let minX = newNodeX - newNodeHalfW;
  let maxX = newNodeX + newNodeHalfW;
  let minY = newNodeY - newNodeHalfH;
  let maxY = newNodeY + newNodeHalfH;

  for (const n of layerNodes) {
    const dims = getNodeDimensions(n);
    const halfW = dims.w / 2;
    const halfH = dims.h / 2;
    if (n.x - halfW < minX) minX = n.x - halfW;
    if (n.x + halfW > maxX) maxX = n.x + halfW;
    if (n.y - halfH < minY) minY = n.y - halfH;
    if (n.y + halfH > maxY) maxY = n.y + halfH;
  }

  return extentsToBounds(minX, maxX, minY, maxY, layerId, layerManualSizes);
}

/**
 * Compute layer bounds from contained nodes, with optional manual size overrides.
 * Accounts for a node being dragged to a new position.
 */
export function computeRegions(
  layerDefs: LayerDef[],
  nodes: NodeData[],
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number },
  layerManualSizes: ManualSizes,
  draggingId: string | null,
  elementDragPos: { x: number; y: number } | null,
  multiDragIds?: string[],
  multiDragDelta?: { dx: number; dy: number } | null,
): RegionBounds[] {
  return layerDefs.map((layer) => {
    const layerNodes = nodes.filter((n) => n.layer === layer.id);
    if (layerNodes.length === 0) {
      const manual = layerManualSizes[layer.id];
      if (manual && manual.left !== undefined && manual.top !== undefined && manual.width !== undefined && manual.height !== undefined) {
        return { ...layer, left: manual.left, width: manual.width, top: manual.top, height: manual.height, empty: true };
      }
      return { ...layer, left: 0, width: 0, top: 0, height: 0, empty: true };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const n of layerNodes) {
      const dims = getNodeDimensions(n);
      const halfW = dims.w / 2;
      const halfH = dims.h / 2;
      let nx = n.x;
      let ny = n.y;
      if (n.id === draggingId && elementDragPos) {
        nx = elementDragPos.x;
        ny = elementDragPos.y;
      } else if (multiDragIds?.includes(n.id) && multiDragDelta) {
        nx = n.x + multiDragDelta.dx;
        ny = n.y + multiDragDelta.dy;
      }
      if (nx - halfW < minX) minX = nx - halfW;
      if (nx + halfW > maxX) maxX = nx + halfW;
      if (ny - halfH < minY) minY = ny - halfH;
      if (ny + halfH > maxY) maxY = ny + halfH;
    }

    const bounds = extentsToBounds(minX, maxX, minY, maxY, layer.id, layerManualSizes);
    return { ...layer, ...bounds, empty: false };
  });
}
