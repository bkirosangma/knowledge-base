"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

export type SVGTool = "select" | "rect" | "ellipse" | "line" | "path" | "text";

export interface SVGCanvasHandle {
  getSvgString: () => string;
  setSvgString: (svg: string) => void;
  setMode: (tool: SVGTool) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
}

interface SVGCanvasProps {
  onChanged: () => void;
  readOnly?: boolean;
}

const CANVAS_W = 800;
const CANVAS_H = 600;

const SVGCanvas = forwardRef<SVGCanvasHandle, SVGCanvasProps>(function SVGCanvas(
  { onChanged, readOnly = false },
  ref,
) {
  const wrapperRef  = useRef<HTMLDivElement>(null); // scroll viewport
  const spacerRef   = useRef<HTMLDivElement>(null); // layout spacer sized to zoomed content
  const containerRef = useRef<HTMLDivElement>(null); // svgcanvas mount point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);
  const zoomRef   = useRef(1);
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("@svgedit/svgcanvas").then(({ default: SvgCanvas }) => {
      if (cancelled || !containerRef.current) return;
      const canvas = new SvgCanvas(containerRef.current, {
        canvas_expansion: 3,
        initFill: { color: "ffffff", opacity: 1 },
        initStroke: { color: "000000", opacity: 1, width: 1 },
        initOpacity: 1,
        dimensions: [CANVAS_W, CANVAS_H],
        imgPath: "/svgedit-cursors",
      });
      canvasRef.current = canvas;
      canvas.bind("changed", () => onChangedRef.current());
    });

    return () => {
      cancelled = true;
      canvasRef.current = null;
    };
  }, []);

  // Visual zoom via CSS transform — avoids updateCanvas() which clips content.
  // getScreenCTM() on mouse events accounts for CSS transforms automatically,
  // so SVG coordinate mapping stays correct without touching canvas.setZoom().
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
  // Capture phase fires before svgcanvas's own wheel listeners.
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

  useImperativeHandle(ref, () => ({
    getSvgString: () => canvasRef.current?.getSvgString() ?? "",
    setSvgString: (svg: string) => canvasRef.current?.setSvgString(svg),
    setMode: (tool: SVGTool) => canvasRef.current?.setMode(tool),
    undo: () => canvasRef.current?.undoMgr?.undo(),
    redo: () => canvasRef.current?.undoMgr?.redo(),
    zoomIn:  () => applyZoom(zoomRef.current * 1.2),
    zoomOut: () => applyZoom(zoomRef.current / 1.2),
    zoomFit: () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      applyZoom(Math.min(wrapper.clientWidth / CANVAS_W, wrapper.clientHeight / CANVAS_H) * 0.9);
    },
  }));

  return (
    <div
      ref={wrapperRef}
      className="flex-1 w-full h-full overflow-auto bg-surface-2"
      data-testid="svg-canvas-container"
    >
      {/* Spacer sized to the zoomed canvas so the scroll container gets the right range */}
      <div ref={spacerRef} style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
        <div ref={containerRef} style={{ position: "absolute", transformOrigin: "0 0" }} />
        {/* Intercepts all pointer events in read mode — pointer-events:none on the container
            div does not block its SVG children, so an overlay is the reliable solution. */}
        {readOnly && <div style={{ position: "absolute", inset: 0 }} />}
      </div>
    </div>
  );
});

export default SVGCanvas;
