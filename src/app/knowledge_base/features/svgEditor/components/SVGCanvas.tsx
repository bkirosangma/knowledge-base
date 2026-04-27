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
  finishOpenPath: () => void;
  setBackground: (color: string) => void;
  resize: (w: number, h: number) => void;
}

interface SVGCanvasProps {
  onChanged: () => void;
  onStyleChange?: (style: SVGStyle) => void;
  readOnly?: boolean;
  /** Called after setSvgString with the file's width, height, and detected background color. */
  onSvgLoaded?: (w: number, h: number, bgColor: string) => void;
}

const CANVAS_W = 800;
const CANVAS_H = 600;
const BG_RECT_ID = "svg-editor-bg";

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘" : "Ctrl ";

const SVGCanvas = forwardRef<SVGCanvasHandle, SVGCanvasProps>(function SVGCanvas(
  { onChanged, onStyleChange, readOnly = false, onSvgLoaded },
  ref,
) {
  const wrapperRef   = useRef<HTMLDivElement>(null); // scroll viewport
  const spacerRef    = useRef<HTMLDivElement>(null); // layout spacer sized to zoomed content
  const containerRef = useRef<HTMLDivElement>(null); // svgcanvas mount point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef  = useRef<any>(null);
  const zoomRef    = useRef(1);
  const canvasSizeRef = useRef({ w: CANVAS_W, h: CANVAS_H });
  const onChangedRef = useRef(onChanged);
  const onStyleChangeRef = useRef(onStyleChange);
  const onSvgLoadedRef = useRef(onSvgLoaded);
  // Suppresses MutationObserver-driven `onChanged` calls during programmatic
  // `setSvgString` rebuilds (load + discard). The library normally fires its
  // own `changed` event for user actions; the observer is a fallback for
  // gaps in the library's emission (e.g. event.js:646 — select-mode mouseup
  // skips the call after a translate, so dragging an existing shape would
  // never mark the editor dirty without this watcher). The flag prevents
  // the load itself from looking like an edit.
  const suppressMutationsRef = useRef(false);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    onStyleChangeRef.current = onStyleChange;
  }, [onStyleChange]);

  useEffect(() => {
    onSvgLoadedRef.current = onSvgLoaded;
  }, [onSvgLoaded]);

  // Disconnect any prior observer, then re-attach to the *current*
  // `#svgcontent` element. The library replaces this element on every
  // `setSvgString` so we have to follow it; an observer pinned to the
  // initial node would silently watch dead DOM.
  const attachMutationObserver = () => {
    mutationObserverRef.current?.disconnect();
    const svgcontent = containerRef.current?.querySelector("#svgcontent");
    if (!svgcontent) {
      mutationObserverRef.current = null;
      return;
    }
    const observer = new MutationObserver(() => {
      if (suppressMutationsRef.current) return;
      onChangedRef.current();
    });
    observer.observe(svgcontent, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    mutationObserverRef.current = observer;
  };

  // clearSvgContentElement() initialises svgContent with x=CANVAS_W, y=CANVAS_H.
  // selectorParentGroup starts at translate(0,0). updateCanvas() syncs them but
  // requires a canvasBackground DOM element we don't have. Do the sync manually.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncLayout = (canvas: any) => {
    const content = canvas.getSvgContent?.();
    if (!content) return;
    const { w, h } = canvasSizeRef.current;
    content.setAttribute("x", "0");
    content.setAttribute("y", "0");
    content.setAttribute("width", String(w));
    content.setAttribute("height", String(h));
    content.setAttribute("viewBox", `0 0 ${w} ${h}`);
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

      // MutationObserver fallback for library event-emission gaps —
      // notably select-mode translate, which `@svgedit/svgcanvas` 7.x
      // omits a `changed` call for. Re-attaches every time the shape
      // layer is rebuilt: `setSvgString` (load + discard) calls
      // `getSvgContent().remove()` then creates a fresh `#svgcontent`
      // (svg-exec.js:401-407), so an observer attached at canvas init
      // is left watching a detached node after the very first load.
      attachMutationObserver();

      canvas.bind("selected", () => {
        if (!onStyleChangeRef.current) return;
        // Read attributes directly from the selected element; getCurProperties
        // is stale at the time "selected" fires (it reflects the previous selection).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selected: (Element | null)[] = (canvas as any).getSelectedElements?.() ?? [];
        const el = selected.find((e) => e != null) as Element | null;
        if (!el) return;
        const fill = el.getAttribute("fill") ?? "";
        const stroke = el.getAttribute("stroke") ?? "";
        const strokeWidth = Number(el.getAttribute("stroke-width") ?? 1);
        onStyleChangeRef.current({
          fill: /^#[0-9a-fA-F]{3,6}$/.test(fill) ? fill : "#000000",
          stroke: /^#[0-9a-fA-F]{3,6}$/.test(stroke) ? stroke : "#000000",
          strokeWidth: isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 1,
        });
      });
    });

    return () => {
      cancelled = true;
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  // Expand stroke hit areas so thin lines are easier to click.
  // When the user misses a path element (clicks on SVG background), check if
  // any path/line is within HIT_TOLERANCE_PX and re-dispatch there instead.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const HIT_TOLERANCE_PX = 8;
    // WeakSet prevents the re-dispatched event from re-triggering this handler.
    const redispatched = new WeakSet<MouseEvent>();

    const onMouseDown = (e: MouseEvent) => {
      if (redispatched.has(e)) return;
      const target = e.target as Element | null;
      if (!target) return;
      // Only expand when clicking on SVG background (not an actual element).
      const tag = target.tagName;
      const id = (target as HTMLElement).id;
      const isBackground = tag === "svg" || id === "svgcanvas" || id === "svgroot"
        || id === "svgcontent" || (tag === "g" && id === "svgcontent");
      if (!isBackground) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = canvas as any;
      const svgRoot = c.getSvgRoot?.() as SVGSVGElement | undefined;
      const layer = c.getCurrentDrawing?.()?.getCurrentLayer?.() as Element | undefined;
      if (!svgRoot || !layer) return;

      const candidates = layer.querySelectorAll<SVGGeometryElement>("path, line, polyline");
      let nearest: SVGGeometryElement | null = null;

      for (const el of candidates) {
        if (el.id === "path_stretch_line" || el.id === BG_RECT_ID) continue;
        try {
          const ctm = (el as SVGGraphicsElement).getScreenCTM();
          if (!ctm) continue;
          const scale = Math.abs(ctm.a) || 1;
          const origSW = parseFloat(el.getAttribute("stroke-width") || "1");
          el.setAttribute("stroke-width", String(Math.max(origSW, (HIT_TOLERANCE_PX / scale) * 2)));
          const pt = svgRoot.createSVGPoint();
          pt.x = e.clientX; pt.y = e.clientY;
          const hit = el.isPointInStroke(pt.matrixTransform(ctm.inverse()));
          el.setAttribute("stroke-width", String(origSW));
          if (hit) { nearest = el; break; }
        } catch { continue; }
      }

      if (!nearest) return;
      e.stopPropagation();
      const ev = new MouseEvent("mousedown", {
        bubbles: true, cancelable: true,
        clientX: e.clientX, clientY: e.clientY,
        button: e.button, buttons: e.buttons,
        altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey,
      });
      redispatched.add(ev);
      nearest.dispatchEvent(ev);
    };

    wrapper.addEventListener("mousedown", onMouseDown, { capture: true });
    return () => wrapper.removeEventListener("mousedown", onMouseDown, { capture: true });
  }, []);

  // Capture pointer on pathedit pointerdown so mouseleave can't fire a
  // synthetic mouseup that kills a handle drag mid-operation.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onPointerDown = (e: PointerEvent) => {
      if (canvasRef.current?.getCurrentMode?.() === "pathedit") {
        try { container.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    };
    container.addEventListener("pointerdown", onPointerDown);
    return () => container.removeEventListener("pointerdown", onPointerDown);
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
      const { w, h } = canvasSizeRef.current;
      spacerRef.current.style.width  = `${w * clamped}px`;
      spacerRef.current.style.height = `${h * clamped}px`;
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
    if (e.key === "Enter" && !mod) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((canvasRef.current as any)?.getCurrentMode?.() === "path") {
        e.preventDefault();
        canvasRef.current?.finishOpenPath?.();
        return;
      }
    }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = canvasRef.current as any;
      if (!canvas) return;
      // Suppress the MutationObserver while the library rewrites the
      // shape layer, so a load doesn't masquerade as a user edit. Cleared
      // on the next macrotask — long enough for the synchronous DOM
      // mutations + any same-tick microtasks to finish, short enough
      // that a real edit a few frames later is still caught.
      suppressMutationsRef.current = true;
      canvas.setSvgString(svg);
      // The library replaced `#svgcontent` — re-attach the observer to
      // the new element, otherwise drag-translate mutations on user
      // shapes won't be seen.
      attachMutationObserver();
      // Read dimensions from the loaded SVG root; fall back to current size.
      const root = canvas.getSvgRoot?.() as Element | undefined;
      if (root) {
        const w = parseInt(root.getAttribute("width") ?? "", 10);
        const h = parseInt(root.getAttribute("height") ?? "", 10);
        if (w > 0 && h > 0) canvasSizeRef.current = { w, h };
      }
      syncLayout(canvas);
      applyZoom(zoomRef.current);
      // Notify parent with loaded size + background colour.
      const bgEl = document.getElementById(BG_RECT_ID);
      onSvgLoadedRef.current?.(
        canvasSizeRef.current.w,
        canvasSizeRef.current.h,
        bgEl?.getAttribute("fill") ?? "none",
      );
      setTimeout(() => { suppressMutationsRef.current = false; }, 0);
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
    setBackground: (color: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = canvasRef.current as any;
      if (!canvas) return;
      const svgContent = canvas.getSvgContent?.() as Element | undefined;
      if (!svgContent) return;
      let bgRect: Element | null = document.getElementById(BG_RECT_ID);
      if (!color || color === "none") {
        bgRect?.remove();
        return;
      }
      if (!bgRect) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        el.id = BG_RECT_ID;
        el.setAttribute("pointer-events", "none");
        svgContent.insertBefore(el, svgContent.firstChild);
        bgRect = el;
      }
      const { w, h } = canvasSizeRef.current;
      bgRect.setAttribute("x", "0");
      bgRect.setAttribute("y", "0");
      bgRect.setAttribute("width", String(w));
      bgRect.setAttribute("height", String(h));
      bgRect.setAttribute("fill", color);
    },
    resize: (w: number, h: number) => {
      if (!w || !h || w <= 0 || h <= 0) return;
      canvasSizeRef.current = { w, h };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = canvasRef.current as any;
      if (!canvas) return;
      const dims = [["width", w], ["height", h], ["viewBox", `0 0 ${w} ${h}`]] as const;
      const svgRoot = canvas.getSvgRoot?.() as Element | undefined;
      if (svgRoot) dims.forEach(([k, v]) => svgRoot.setAttribute(k, String(v)));
      const svgContent = canvas.getSvgContent?.() as Element | undefined;
      if (svgContent) {
        svgContent.setAttribute("x", "0"); svgContent.setAttribute("y", "0");
        dims.forEach(([k, v]) => svgContent.setAttribute(k, String(v)));
      }
      const bgRect = document.getElementById(BG_RECT_ID);
      if (bgRect) { bgRect.setAttribute("width", String(w)); bgRect.setAttribute("height", String(h)); }
      applyZoom(zoomRef.current);
    },
    finishOpenPath: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = canvasRef.current as any;
      if (!canvas || canvas.getCurrentMode?.() !== "path") return;
      const drawnPath = canvas.getDrawnPath?.();
      if (!drawnPath) return;
      const id = canvas.getId?.();
      // Remove path stretch-line preview
      document.getElementById("path_stretch_line")?.remove();
      // Remove path from internal tracking (so toEditMode creates fresh state)
      canvas.removePath_?.(id);
      canvas.setDrawnPath?.(null);
      canvas.setStarted?.(false);
      // Enter edit mode for the finished (open) path
      if (id) {
        const pathEl = document.getElementById(id);
        if (pathEl) canvas.pathActions?.toEditMode?.(pathEl);
      }
    },
    zoomIn:  () => applyZoom(zoomRef.current * 1.2),
    zoomOut: () => applyZoom(zoomRef.current / 1.2),
    zoomFit: () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const { w, h } = canvasSizeRef.current;
      applyZoom(Math.min(wrapper.clientWidth / w, wrapper.clientHeight / h) * 0.9);
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
