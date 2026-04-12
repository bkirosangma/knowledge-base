// src/app/architecture_designer/components/SplitPane.tsx
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;   // 0-1, default 0.5
  storageKey?: string;     // localStorage key for persisting ratio
}

export default function SplitPane({
  left,
  right,
  defaultRatio = 0.5,
  storageKey = "split-pane-ratio",
}: SplitPaneProps) {
  const [ratio, setRatio] = useState(() => {
    if (typeof window === "undefined") return defaultRatio;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseFloat(stored) : defaultRatio;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
      setRatio(newRatio);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem(storageKey, String(ratio));
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [ratio, storageKey]);

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <div style={{ width: `${ratio * 100}%` }} className="overflow-hidden">
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1 bg-slate-300 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="overflow-hidden">
        {right}
      </div>
    </div>
  );
}
