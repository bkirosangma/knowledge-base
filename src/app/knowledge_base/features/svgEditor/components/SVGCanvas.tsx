"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from "react";

export type SVGTool = "select" | "rect" | "ellipse" | "line" | "path" | "text";

export interface SVGStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface SVGCanvasHandle {
  getSvgString: () => string;
  setSvgString: (svg: string) => void;
  setMode: (tool: SVGTool) => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  setFill: (color: string) => void;
  setStroke: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setLinkedHandles: (linked: boolean) => void;
}

interface SVGCanvasProps {
  onChanged: () => void;
  onStyleChange?: (style: SVGStyle) => void;
  readOnly?: boolean;
}

const CANVAS_W = 800;
const CANVAS_H = 600;

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl ";

const SVGCanvas = forwardRef<SVGCanvasHandle, SVGCanvasProps>(function SVGCanvas(
  { onChanged, onStyleChange, readOnly = false },
  ref,
) {
  const wrapperRef   = useRef<HTMLDivElement>(null); // scroll viewport
  const spacerRef    = useRef<HTMLDivElement>(null); // layout spacer sized to zoomed content
  const containerRef = useRef<HTMLDivElement>(null); // svgcanvas mount point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef  = useRef<any>(null);
  const zoomRef    = useRef(1);
  const onChangedRef = useRef(onChanged);
  const onStyleChangeRef = useRef(onStyleChange);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    onStyleChangeRef.current = onStyleChange;
  }, [onStyleChange]);

  // clearSvgContentElement() initialises svgContent with x=CANVAS_W, y=CANVAS_H.
  // selectorParentGroup starts at translate(0,0). updateCanvas() syncs them but
  // requires a canvasBackground DOM element we don't have. Do the sync manually.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncLayout = (canvas: any) => {
    const content = canvas.getSvgContent?.();
    if (!content) return;
    content.setAttribute("x", "0");
    content.setAttribute("y", "0");
    content.setAttribute("width", String(CANVAS_W));
    content.setAttribute("height", String(CANVAS_H));
    content.setAttribute("viewBox", `0 0 ${CANVAS_W} ${CANVAS_H}`);
    canvas.selectorManager?.selectorParentGroup?.setAttribute("transform", "translate(0,0)");
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("@svgedit/svgcanvas").then(({ default: SvgCanvas }) => {
      if (cancelled || !containerRef.current) return;
      const canvas = new SvgCanvas(containerRef.current, {
        initFill: { color: "ffffff", opacity: 1 },
        initStroke: { color: "000000", opacity: 1, width: 1 },
        initOpacity: 1,
        dimensions: [CANVAS_W, CANVAS_H],
        imgPath: "/svgedit-cursors",
      });
      canvasRef.current = canvas;
      syncLayout(canvas);
      canvas.bind("changed", () => onChangedRef.current());
      canvas.bind("selected", () => {
        const c = canvasRef.current;
        if (!c || !onStyleChangeRef.current) return;
        const fill = c.getCurProperties?.("fill") ?? "#000000";
        const stroke = c.getCurProperties?.("stroke") ?? "#000000";
        const strokeWidth = Number(c.getCurProperties?.("stroke_width") ?? 1);
        onStyleChangeRef.current({
          fill: /^#[0-9a-fA-F]{3,6}$/.test(fill) ? fill : "#000000",
          stroke: /^#[0-9a-fA-F]{3,6}$/.test(stroke) ? stroke : "#000000",
          strokeWidth: isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 1,
        });
      });
    });

    return () => {
      cancelled = true;
      canvasRef.current = null;
    };
  }, []);

  // Close context menu on any click outside it
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close, { capture: true });
    return () => document.removeEventListener("click", close, { capture: true });
  }, [menu]);

  // Visual zoom via CSS transform — avoids updateCanvas() which clips content.
  const applyZoom = (zoom: number) => {
    const clamped = Math.max(0.1, Math.min(10, zoom));
    zoomRef.current = clamped;
    if (containerRef.current) {
      containerRef.current.style.transform = `scale(${clamped})`;
      containerRef.current.style.transformOrigin = "0 0";
    }
    if (spacerRef.current) {
      spacerRef.current.style.width  = `${CANVAS_W * clamped}px`;
      spacerRef.current.style.height = `${CANVAS_H * clamped}px`;
    }
  };

  // Pinch-to-zoom (ctrlKey + wheel) and 2-finger scroll pan.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const px = e.deltaMode === 0 ? e.deltaY : e.deltaY * 30;
        applyZoom(zoomRef.current * (1 - px * 0.004));
      } else {
        el.scrollLeft += e.deltaX;
        el.scrollTop  += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
      e.preventDefault();
      canvasRef.current?.deleteSelectedElements?.();
    } else if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      canvasRef.current?.copySelectedElements?.();
    } else if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      canvasRef.current?.pasteElements?.();
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      e.stopPropagation(); // prevent browser bookmark shortcut
      canvasRef.current?.cloneSelectedElements?.(10, 10);
    }
  }, [readOnly]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // always suppress browser context menu inside editor
    if (!readOnly) setMenu({ x: e.clientX, y: e.clientY });
  }, [readOnly]);

  useImperativeHandle(ref, () => ({
    getSvgString: () => canvasRef.current?.getSvgString() ?? "",
    setSvgString: (svg: string) => {
      canvasRef.current?.setSvgString(svg);
      syncLayout(canvasRef.current);
    },
    setMode: (tool: SVGTool) => canvasRef.current?.setMode(tool),
    clearSelection: () => canvasRef.current?.clearSelection(),
    deleteSelected: () => canvasRef.current?.deleteSelectedElements?.(),
    duplicateSelected: () => canvasRef.current?.cloneSelectedElements?.(10, 10),
    copySelected: () => canvasRef.current?.copySelectedElements?.(),
    paste: () => canvasRef.current?.pasteElements?.(),
    undo: () => canvasRef.current?.undoMgr?.undo(),
    redo: () => canvasRef.current?.undoMgr?.redo(),
    setFill: (color: string) => canvasRef.current?.setColor?.("fill", color),
    setStroke: (color: string) => canvasRef.current?.setColor?.("stroke", color),
    setStrokeWidth: (width: number) => canvasRef.current?.setStrokeWidth?.(width),
    setLinkedHandles: (linked: boolean) => canvasRef.current?.setLinkControlPoints?.(linked),
    zoomIn:  () => applyZoom(zoomRef.current * 1.2),
    zoomOut: () => applyZoom(zoomRef.current / 1.2),
    zoomFit: () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      applyZoom(Math.min(wrapper.clientWidth / CANVAS_W, wrapper.clientHeight / CANVAS_H) * 0.9);
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasSel = () => (canvasRef.current?.getSelectedElements?.() ?? []).some((el: any) => el != null);
  const hasClip = () => {
    const id = canvasRef.current?.getClipboardID?.();
    return id ? !!sessionStorage.getItem(id) : false;
  };

  const MENU_ITEMS = [
    { label: "Copy",      shortcut: `${MOD}C`, disabled: !hasSel(), action: () => canvasRef.current?.copySelectedElements?.()       },
    { label: "Paste",     shortcut: `${MOD}V`, disabled: !hasClip(), action: () => canvasRef.current?.pasteElements?.()              },
    { label: "Duplicate", shortcut: `${MOD}D`, disabled: !hasSel(), action: () => canvasRef.current?.cloneSelectedElements?.(10, 10) },
    null,
    { label: "Delete",    shortcut: "Del",     disabled: !hasSel(), action: () => canvasRef.current?.deleteSelectedElements?.()      },
  ] as const;

  return (
    <div
      ref={wrapperRef}
      className="flex-1 w-full h-full overflow-auto bg-surface-2 outline-none"
      tabIndex={0}
      data-testid="svg-canvas-container"
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onMouseDown={() => wrapperRef.current?.focus()}
    >
      {/* Spacer sized to the zoomed canvas so the scroll container gets the right range */}
      <div ref={spacerRef} style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
        <div ref={containerRef} style={{ position: "absolute", transformOrigin: "0 0" }} />
        {/* Overlay blocks all pointer events in read mode */}
        {readOnly && <div style={{ position: "absolute", inset: 0 }} />}
      </div>

      {menu && (
        <div
          className="fixed z-50 rounded-lg shadow-lg border border-line py-1 min-w-40"
          style={{ top: menu.y, left: menu.x, background: "var(--color-surface)" }}
          onClick={e => e.stopPropagation()}
        >
          {MENU_ITEMS.map((item, i) =>
            item === null ? (
              <div key={i} className="h-px bg-line my-1" />
            ) : (
              <button
                key={item.label}
                disabled={item.disabled}
                className="flex items-center justify-between w-full px-3 py-1 text-xs text-left disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
                onClick={() => { item.action(); setMenu(null); }}
              >
                <span className="text-ink">{item.label}</span>
                <span className="text-mute ml-8 font-mono">{item.shortcut}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
});

export default SVGCanvas;
