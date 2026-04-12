import { useCallback } from "react";
import { Box } from "lucide-react";
import type { NodeData, LayerDef, Selection, RegionBounds } from "../types";
import { getNodeHeight } from "../utils/geometry";
import { DEFAULT_NODE_WIDTH, DEFAULT_LAYER_WIDTH, DEFAULT_LAYER_HEIGHT } from "../utils/constants";
import { findNonOverlappingLayerPosition, clampElementToAvoidLayerCollision } from "../utils/collisionUtils";
import { snapToGrid } from "../utils/gridSnap";
import type { LevelMap } from "../utils/levelModel";
import { predictLayerBounds } from "../utils/layerBounds";
import type { ContextMenuTarget } from "../utils/geometry";

type ManualSizes = Record<string, { left?: number; width?: number; top?: number; height?: number }>;
type ContextMenuState = { clientX: number; clientY: number; canvasX: number; canvasY: number; target: ContextMenuTarget };

export function useContextMenuActions(
  contextMenu: ContextMenuState | null,
  regions: RegionBounds[],
  nodes: NodeData[],
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number },
  layerManualSizes: ManualSizes,
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>,
  setLayerManualSizes: React.Dispatch<React.SetStateAction<ManualSizes>>,
  setSelection: React.Dispatch<React.SetStateAction<Selection>>,
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>,
  onActionComplete?: (description: string) => void,
  levelMapRef?: React.RefObject<LevelMap>,
): { handleAddElement: () => void; handleAddLayer: () => void } {

  const handleAddElement = useCallback(() => {
    if (!contextMenu) return;
    const cx = contextMenu.canvasX;
    const cy = contextMenu.canvasY;
    const newW = DEFAULT_NODE_WIDTH;
    const newH = getNodeHeight(newW);
    const halfW = newW / 2;
    const halfH = newH / 2;

    // If right-clicked inside a layer, assign the element to that layer
    let targetLayer = "";
    for (const r of regions) {
      if (!r.empty && cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
        targetLayer = r.id;
        break;
      }
    }

    let finalX = cx;
    let finalY = cy;
    if (targetLayer) {
      // Layer collision avoidance: ensure layer expansion doesn't overlap other layers
      // Also checks node overlap internally so the element doesn't land on existing nodes
      const result = clampElementToAvoidLayerCollision(
        cx, cy, halfW, halfH,
        targetLayer, nodes, getNodeDimensions,
        layerManualSizes, regions,
        predictLayerBounds,
      );
      finalX = result.x;
      finalY = result.y;
      if (result.layerShift) {
        const { dx, dy } = result.layerShift;
        // Shift all existing nodes in the layer by the same delta
        setNodes((prev) => prev.map((n) =>
          n.layer === targetLayer ? { ...n, x: n.x + dx, y: n.y + dy } : n,
        ));
        // Also shift the new element position
        finalX += dx;
        finalY += dy;
        // Update manual sizes if present
        setLayerManualSizes((prev) => {
          const existing = prev[targetLayer];
          if (!existing) return prev;
          return {
            ...prev,
            [targetLayer]: {
              ...existing,
              left: existing.left !== undefined ? existing.left + dx : undefined,
              top: existing.top !== undefined ? existing.top + dy : undefined,
            },
          };
        });
      }
    } else {
      // No layer: simple collision avoidance — shift down until no overlap with same-level nodes
      // New element without a layer is level 1, base "canvas"
      const peers = levelMapRef
        ? nodes.filter((n) => {
            const nLevel = levelMapRef.current?.get(n.id);
            return nLevel && nLevel.level === 1 && nLevel.base === "canvas";
          })
        : nodes;
      const maxAttempts = 50;
      for (let i = 0; i < maxAttempts; i++) {
        const overlaps = peers.some((n) => {
          const dims = getNodeDimensions(n);
          const nHalfW = dims.w / 2;
          const nHalfH = dims.h / 2;
          return Math.abs(finalX - n.x) < halfW + nHalfW && Math.abs(finalY - n.y) < halfH + nHalfH;
        });
        if (!overlaps) break;
        finalY += 20;
      }
    }

    finalX = snapToGrid(finalX);
    finalY = snapToGrid(finalY);
    const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNodes((prev) => [...prev, { id: newId, label: "New Element", icon: Box, x: finalX, y: finalY, w: newW, layer: targetLayer }]);
    setSelection({ type: "node", id: newId });
    setContextMenu(null);
    onActionComplete?.("Add element");
  }, [contextMenu, regions, nodes, getNodeDimensions, layerManualSizes, setNodes, setLayerDefs, setLayerManualSizes, setSelection, setContextMenu, onActionComplete]);

  const handleAddLayer = useCallback(() => {
    if (!contextMenu) return;
    const cx = contextMenu.canvasX;
    const cy = contextMenu.canvasY;
    const newW = DEFAULT_LAYER_WIDTH;
    const newH = DEFAULT_LAYER_HEIGHT;

    // Use the same edge-snapping collision logic as layer drag clamping
    const pos = findNonOverlappingLayerPosition(
      { left: cx - newW / 2, top: cy - newH / 2, width: newW, height: newH },
      regions,
    );
    const placeLeft = snapToGrid(pos.left);
    const placeTop = snapToGrid(pos.top);

    const newId = `ly-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLayerDefs((prev) => [...prev, { id: newId, title: "NEW LAYER", bg: "#eff3f9", border: "#cdd6e4", textColor: "#334155" }]);
    setLayerManualSizes((prev) => ({ ...prev, [newId]: { left: placeLeft, width: snapToGrid(newW), top: placeTop, height: snapToGrid(newH) } }));
    setSelection({ type: "layer", id: newId });
    setContextMenu(null);
    onActionComplete?.("Add layer");
  }, [contextMenu, regions, setLayerDefs, setLayerManualSizes, setSelection, setContextMenu, onActionComplete]);

  return { handleAddElement, handleAddLayer };
}
