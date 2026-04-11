import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";

const KEY_COL = "w-[72px] shrink-0";

export function AutocompleteInput({
  label, value, suggestions, onCommit, onClear,
}: {
  label: string;
  value: string;
  suggestions: string[];
  onCommit: (v: string) => boolean;
  onClear?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(value); setEditing(false); setError(false); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const filtered = editing
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft)
    : [];

  const commit = useCallback((v: string) => {
    if (onCommit(v)) {
      setEditing(false);
      setError(false);
    } else {
      setError(true);
      inputRef.current?.focus();
    }
  }, [onCommit]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
    setError(false);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    if (!editing) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit(draft);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editing, draft, commit]);

  if (!editing) {
    return (
      <div
        className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0 cursor-text"
        onDoubleClick={() => setEditing(true)}
      >
        <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
        <span className="text-[13px] text-slate-800 break-all min-w-0 flex-1">{value || <span className="text-slate-300 italic">None</span>}</span>
        {onClear && value && (
          <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 ml-1 cursor-pointer">
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative border-b border-slate-100 last:border-b-0">
      <div className="flex items-center py-1.5">
        <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
        <input
          ref={inputRef}
          className={`text-[13px] text-slate-800 bg-slate-50 rounded px-1.5 py-0.5 outline-none min-w-0 flex-1 border ${error ? "border-red-400" : "border-slate-300"} focus:border-blue-400`}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape") cancel();
          }}
        />
      </div>
      {filtered.length > 0 && (
        <div className="absolute left-[72px] right-0 top-full z-50 bg-white border border-slate-200 rounded shadow-lg max-h-[120px] overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              className="block w-full text-left text-[12px] text-slate-600 hover:bg-blue-50 hover:text-blue-700 px-2 py-1 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
