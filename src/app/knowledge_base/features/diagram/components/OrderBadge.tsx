import { useState, useRef, useEffect } from "react";

interface OrderBadgeProps {
  /** The numeric order of this node within the focused flow. Undefined hides the badge in read mode. */
  value: number | undefined;
  /** When true, the badge is interactive: an empty placeholder shows even if value is undefined. */
  editable: boolean;
  /** Called with the new value (integer) or `undefined` when the input is cleared. */
  onChange: (next: number | undefined) => void;
  /** Stable identifier for testability. */
  nodeId: string;
}

/**
 * Corner numeral badge displayed at the top-left of a node when a flow is focused.
 *
 * Read mode: solid blue circle with the order numeral. Hidden when value is undefined.
 * Edit mode: dashed-border editable rectangle. Click → input opens. Enter or blur commits;
 * Escape cancels. Empty value commits as `undefined`.
 */
export function OrderBadge({ value, editable, onChange, nodeId }: OrderBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value?.toString() ?? "");
  }, [value]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (!editable && value === undefined) return null;

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onChange(undefined);
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n)) onChange(n);
    }
    setIsEditing(false);
  };
  const cancel = () => {
    setDraft(value?.toString() ?? "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        data-testid={`order-badge-input-${nodeId}`}
        className="absolute -top-3 -left-3 w-9 h-7 px-1 text-xs font-bold text-blue-800 bg-white border-2 border-dashed border-blue-500 rounded text-center"
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
      />
    );
  }

  const isEmpty = value === undefined;
  return (
    <button
      type="button"
      data-testid={`order-badge-${nodeId}`}
      onClick={editable ? () => setIsEditing(true) : undefined}
      className={
        "absolute -top-3 -left-3 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 " +
        (isEmpty
          ? "bg-white text-blue-800 border-dashed border-blue-500"
          : "bg-blue-600 text-white border-white shadow") +
        (editable ? " cursor-pointer" : " cursor-default")
      }
      tabIndex={editable ? 0 : -1}
      aria-label={isEmpty ? `Order: unset for ${nodeId}` : `Order ${value} for ${nodeId}`}
    >
      {value ?? ""}
    </button>
  );
}
