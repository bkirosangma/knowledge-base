import { useEffect, useRef } from "react";

/**
 * Records a history action when a drag value transitions from truthy to falsy,
 * provided the associated didMoveRef indicates movement actually occurred.
 */
export function useDragEndRecorder(
  dragValue: unknown,
  didMoveRef: React.RefObject<boolean> | null,
  description: string,
  scheduleRecord: (desc: string) => void,
) {
  const prev = useRef<unknown>(null);
  useEffect(() => {
    if (prev.current && !dragValue && (didMoveRef === null || didMoveRef.current)) {
      scheduleRecord(description);
    }
    prev.current = dragValue;
  }, [dragValue, scheduleRecord, description, didMoveRef]);
}
