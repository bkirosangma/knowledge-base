import { useState, useRef, useEffect, useCallback, type ComponentType } from "react";
import { ChevronRight, X } from "lucide-react";
import { getIcon, getIconNames } from "../../utils/iconRegistry";

export const KEY_COL = "w-[72px] shrink-0";

export interface RegionBounds {
  id: string;
  title: string;
  left: number;
  width: number;
  top: number;
  height: number;
  bg: string;
  border: string;
  textColor?: string;
}

export function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start py-1.5 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
      <span className="text-[13px] text-slate-800 break-all min-w-0">{value}</span>
    </div>
  );
}

export function EditableRow({
  label,
  value,
  onCommit,
  onClear,
}: {
  label: string;
  value: string;
  onCommit: (newValue: string) => boolean;
  onClear?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); setEditing(false); setError(false); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); setError(false); return; }
    if (!trimmed || !onCommit(trimmed)) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    setEditing(false);
  }, [draft, value, onCommit]);

  const cancel = useCallback(() => { setDraft(value); setEditing(false); setError(false); }, [value]);

  if (!editing) {
    return (
      <div
        className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0 cursor-text"
        onDoubleClick={() => setEditing(true)}
      >
        <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
        <span className="text-[13px] text-slate-800 break-all min-w-0 flex-1">{value}</span>
        {onClear && value && (
          <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 ml-1 cursor-pointer">
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center py-1 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
      <input
        ref={inputRef}
        className={`text-[13px] text-slate-800 bg-slate-50 border rounded px-1.5 py-0.5 outline-none w-full min-w-0 ${error ? "border-red-400" : "border-slate-300 focus:border-blue-400"}`}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
      />
    </div>
  );
}

export function EditableIdRow({
  label,
  value,
  prefix,
  onCommit,
}: {
  label: string;
  value: string;
  prefix: string;
  onCommit: (newFullId: string) => boolean;
}) {
  const suffix = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suffix);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = value.startsWith(prefix) ? value.slice(prefix.length) : value;
    setDraft(s); setEditing(false); setError(false);
  }, [value, prefix]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    const newId = prefix + trimmed;
    if (newId === value) { setEditing(false); setError(false); return; }
    if (!trimmed || !onCommit(newId)) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    setEditing(false);
  }, [draft, value, prefix, onCommit]);

  const cancel = useCallback(() => {
    const s = value.startsWith(prefix) ? value.slice(prefix.length) : value;
    setDraft(s); setEditing(false); setError(false);
  }, [value, prefix]);

  if (!editing) {
    return (
      <div
        className="flex items-start py-1.5 border-b border-slate-100 last:border-b-0 cursor-text"
        onDoubleClick={() => setEditing(true)}
      >
        <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
        <span className="text-[13px] text-slate-800 break-all min-w-0">
          <span className="text-slate-400">{prefix}</span>{suffix}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center py-1 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
      <div className={`flex items-center bg-slate-50 border rounded overflow-hidden min-w-0 w-full ${error ? "border-red-400" : "border-slate-300 focus-within:border-blue-400"}`}>
        <span className="text-[13px] text-slate-400 pl-1.5 select-none">{prefix}</span>
        <input
          ref={inputRef}
          className="text-[13px] text-slate-800 bg-transparent outline-none px-1 py-0.5 w-full min-w-0"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(false); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        />
      </div>
    </div>
  );
}

export function ListItem({
  item,
  onSelect,
}: {
  item: { id: string; name: string; sub?: string };
  onSelect?: (id: string) => void;
}) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const showTooltip = useCallback(() => {
    const parts: string[] = [];
    if (nameRef.current && nameRef.current.scrollWidth > nameRef.current.clientWidth) parts.push(item.name);
    if (subRef.current && subRef.current.scrollWidth > subRef.current.clientWidth) parts.push(item.sub!);
    if (parts.length) {
      timerRef.current = setTimeout(() => setTooltip(parts.join("\n")), 500);
    }
  }, [item.name, item.sub]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTooltip(null);
  }, []);

  return (
    <button
      className="block w-full text-left text-[12px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1.5 py-0.5 transition-colors cursor-pointer relative"
      onClick={() => onSelect?.(item.id)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <span ref={nameRef} className="block truncate">{item.name}</span>
      {item.sub && <span ref={subRef} className="block text-[10px] text-slate-400 truncate">{item.sub}</span>}
      {tooltip && (
        <span className="absolute left-0 bottom-full mb-1 z-50 bg-slate-800 text-white text-[11px] rounded px-2 py-1 shadow-lg whitespace-pre-wrap max-w-[220px] pointer-events-none">
          {tooltip}
        </span>
      )}
    </button>
  );
}

export function ExpandableListRow({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: { id: string; name: string; sub?: string }[];
  onSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        className="flex items-start py-1.5 w-full text-left hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-slate-800 min-w-0">
          {items.length}
          <ChevronRight
            size={12}
            className={`text-slate-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          />
        </span>
      </button>
      {expanded && (
        <div className="pl-[72px] pb-1.5 space-y-0.5">
          {items.map((item, idx) => (
            <ListItem key={`${item.id}-${idx}`} item={item} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function IconPickerRow({
  currentIcon,
  currentName,
  onSelect,
}: {
  currentIcon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  currentName: string;
  onSelect?: (icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allNames = getIconNames();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const CurrentIcon = currentIcon;

  return (
    <div ref={ref} className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0 relative">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Icon</span>
      <button
        className="flex items-center gap-1.5 text-[13px] text-slate-800 hover:text-blue-600 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <CurrentIcon size={14} className="text-slate-600" strokeWidth={1.5} />
        {currentName}
        <ChevronRight size={12} className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-0.5 bg-white border border-slate-200 rounded shadow-lg z-50 w-[248px] max-h-[280px] overflow-y-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {allNames.map((name) => {
              const Icon = getIcon(name)!;
              const isActive = name === currentName;
              return (
                <button
                  key={name}
                  title={name}
                  className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors cursor-pointer ${
                    isActive ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200" : "hover:bg-slate-50 text-slate-600"
                  }`}
                  onClick={() => {
                    const icon = getIcon(name);
                    if (icon) onSelect?.(icon);
                    setOpen(false);
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span className="text-[8px] leading-tight truncate w-full text-center">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const COLOR_SCHEMES = [
  { name: "Default",  node: { fill: "#ffffff", border: "#e2e8f0", text: "#1e293b" }, layer: { fill: "#eff3f9", border: "#cdd6e4", text: "#334155" }, line: "#3b82f6" },
  { name: "Ocean",    node: { fill: "#eff6ff", border: "#93c5fd", text: "#1e3a5f" }, layer: { fill: "#dbeafe", border: "#60a5fa", text: "#1e3a5f" }, line: "#2563eb" },
  { name: "Emerald",  node: { fill: "#ecfdf5", border: "#6ee7b7", text: "#064e3b" }, layer: { fill: "#d1fae5", border: "#34d399", text: "#064e3b" }, line: "#059669" },
  { name: "Amber",    node: { fill: "#fffbeb", border: "#fcd34d", text: "#78350f" }, layer: { fill: "#fef3c7", border: "#f59e0b", text: "#78350f" }, line: "#d97706" },
  { name: "Rose",     node: { fill: "#fff1f2", border: "#fda4af", text: "#881337" }, layer: { fill: "#ffe4e6", border: "#fb7185", text: "#881337" }, line: "#e11d48" },
  { name: "Slate",    node: { fill: "#f8fafc", border: "#94a3b8", text: "#0f172a" }, layer: { fill: "#f1f5f9", border: "#64748b", text: "#0f172a" }, line: "#475569" },
] as const;

export function ColorSchemeRow({
  type,
  currentColors,
  onSelect,
}: {
  type: "node" | "layer" | "line";
  currentColors: { fill: string; border: string; text: string } | { color: string };
  onSelect: (scheme: typeof COLOR_SCHEMES[number]) => void;
}) {
  return (
    <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Scheme</span>
      <div className="flex items-center gap-1.5">
        {COLOR_SCHEMES.map((scheme) => {
          const swatchColor = type === "line" ? scheme.line : scheme[type].border;
          const isActive = type === "line"
            ? "color" in currentColors && currentColors.color === scheme.line
            : "fill" in currentColors
              && currentColors.fill === scheme[type].fill
              && currentColors.border === scheme[type].border
              && currentColors.text === scheme[type].text;
          return (
            <button
              key={scheme.name}
              title={scheme.name}
              className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${isActive ? "ring-2 ring-blue-400 ring-offset-1 border-white" : "border-slate-200 hover:border-slate-400"}`}
              style={{ backgroundColor: swatchColor }}
              onClick={() => onSelect(scheme)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: (hex: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); setEditing(false); setError(false); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const isValidHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

  const commit = useCallback(() => {
    const trimmed = draft.trim().toLowerCase();
    const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (hex === value) { setEditing(false); setError(false); return; }
    if (!isValidHex(hex)) { setError(true); inputRef.current?.focus(); return; }
    onChange?.(hex);
    setError(false);
    setEditing(false);
  }, [draft, value, onChange]);

  const cancel = useCallback(() => { setDraft(value); setEditing(false); setError(false); }, [value]);

  return (
    <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
        />
        {editing ? (
          <input
            ref={inputRef}
            className={`text-[13px] text-slate-800 font-mono bg-slate-50 border rounded px-1.5 py-0.5 outline-none w-[80px] ${error ? "border-red-400" : "border-slate-300 focus:border-blue-400"}`}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(false); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          />
        ) : (
          <span
            className="text-[13px] text-slate-600 font-mono cursor-text"
            onDoubleClick={() => setEditing(true)}
          >{value}</span>
        )}
      </div>
    </div>
  );
}

export function DropdownRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange?: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0 relative">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>
        {label}
      </span>
      <button
        className="text-[13px] text-slate-800 hover:text-blue-600 transition-colors cursor-pointer flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        {selected?.label ?? value}
        <ChevronRight size={12} className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-[72px] top-full mt-0.5 bg-white border border-slate-200 rounded shadow-lg z-50 min-w-[120px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`block w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50 transition-colors cursor-pointer ${
                opt.value === value ? "text-blue-600 font-semibold" : "text-slate-700"
              }`}
              onClick={() => { onChange?.(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
