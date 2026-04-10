import { useRef } from "react";

/** Keep a ref always in sync with the latest value — avoids repeated useRef + assignment boilerplate. */
export function useSyncRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
