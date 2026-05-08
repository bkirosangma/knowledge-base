import { useCallback, useEffect, useRef, useState } from "react";
import { getClaudeChatHeight, setClaudeChatHeight } from "../../../infrastructure/settingsStore";

const MIN_HEIGHT = 120;
const TOP_RESERVE = 80; // header + footer

function clamp(h: number): number {
  const max = (typeof window !== "undefined" ? window.innerHeight : 800) - TOP_RESERVE;
  return Math.max(MIN_HEIGHT, Math.min(h, max));
}

export function useDrawerState() {
  const [isOpen, setOpen] = useState(false);
  const [height, setHeightState] = useState(320);
  // Prevent the async mount-load from clobbering a user-initiated resize that
  // races with the initial settings fetch.
  const userSetRef = useRef(false);

  useEffect(() => {
    void getClaudeChatHeight().then(h => {
      if (!userSetRef.current) setHeightState(clamp(h));
    });
  }, []);

  const setHeight = useCallback(async (px: number) => {
    userSetRef.current = true;
    const next = clamp(px);
    setHeightState(next);
    await setClaudeChatHeight(next);
  }, []);

  return {
    isOpen,
    height,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(o => !o),
    setHeight,
  };
}
