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
}

const SVGCanvas = forwardRef<SVGCanvasHandle, SVGCanvasProps>(function SVGCanvas(
  { onChanged },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);
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
        dimensions: [800, 600],
      });
      canvasRef.current = canvas;
      canvas.bind("changed", () => onChangedRef.current());
    });

    return () => {
      cancelled = true;
      canvasRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getSvgString: () => canvasRef.current?.getSvgString() ?? "",
    setSvgString: (svg: string) => canvasRef.current?.setSvgString(svg),
    setMode: (tool: SVGTool) => canvasRef.current?.setMode(tool),
    undo: () => canvasRef.current?.undoMgr?.undo(),
    redo: () => canvasRef.current?.undoMgr?.redo(),
    zoomIn: () => {
      const z = canvasRef.current?.getZoom() ?? 1;
      canvasRef.current?.setZoom(z * 1.2);
    },
    zoomOut: () => {
      const z = canvasRef.current?.getZoom() ?? 1;
      canvasRef.current?.setZoom(z / 1.2);
    },
    zoomFit: () => canvasRef.current?.zoomChanged?.(window, "fit"),
  }));

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full overflow-auto"
      data-testid="svg-canvas-container"
    />
  );
});

export default SVGCanvas;
