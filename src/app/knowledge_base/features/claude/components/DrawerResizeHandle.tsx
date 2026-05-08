import { useCallback, useEffect, useRef, useState } from "react";

interface DrawerResizeHandleProps {
  onResize: (height: number) => void;
  initialHeight: number;
}

export function DrawerResizeHandle({ onResize, initialHeight }: DrawerResizeHandleProps) {
  const startY = useRef<number | null>(null);
  const startH = useRef<number>(initialHeight);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    function move(e: MouseEvent) {
      if (startY.current === null) return;
      const delta = startY.current - e.clientY;
      onResize(startH.current + delta);
    }
    function up() {
      startY.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onResize]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    startH.current = initialHeight;
  }, [initialHeight]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chat drawer"
      className={`h-1 cursor-ns-resize border-t ${hover ? "bg-accent/40 border-accent" : "border-white/10"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={onMouseDown}
    />
  );
}
