import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronRight, X } from "lucide-react";
import type { NodeData, Connection, LineCurveAlgorithm } from "../utils/types";

interface RegionBounds {
  id: string;
  title: string;
  left: number;
  width: number;
  top: number;
  height: number;
}

interface PropertiesPanelProps {
  selection: { type: "node" | "layer" | "line"; id: string } | null;
  title: string;
  nodes: NodeData[];
  connections: Connection[];
  regions: RegionBounds[];
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateTitle?: (title: string) => void;
  onUpdateNode?: (id: string, updates: Partial<{ id: string; label: string; sub: string }>) => void;
  onUpdateLayer?: (id: string, updates: Partial<{ id: string; title: string }>) => void;
  onUpdateConnection?: (id: string, updates: Partial<{ id: string; label: string }>) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
}

const KEY_COL = "w-[72px] shrink-0";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start py-1.5 border-b border-slate-100 last:border-b-0">
      <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>{label}</span>
      <span className="text-[13px] text-slate-800 break-all min-w-0">{value}</span>
    </div>
  );
}

function EditableRow({
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

function EditableIdRow({
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

export default function PropertiesPanel({ selection, title, nodes, connections, regions, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve }: PropertiesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const allNodeIds = nodes.map((n) => n.id);
  const allLayerIds = regions.map((r) => r.id);
  const allConnectionIds = connections.map((c) => c.id);

  return (
    <div
      className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col transition-[width] duration-200 overflow-hidden"
      style={{ width: collapsed ? 36 : 280 }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 px-2.5 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
      >
        <ChevronRight
          size={16}
          className={`text-slate-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        />
        {!collapsed && <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!selection && (
            <ArchitectureProperties
              title={title}
              regions={regions}
              nodes={nodes}
              onUpdateTitle={onUpdateTitle}
              onSelectLayer={onSelectLayer}
              onSelectNode={onSelectNode}
              lineCurve={lineCurve}
              onUpdateLineCurve={onUpdateLineCurve}
            />
          )}

          {selection?.type === "node" && (
            <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} />
          )}
          {selection?.type === "layer" && (
            <LayerProperties id={selection.id} regions={regions} nodes={nodes} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} />
          )}
          {selection?.type === "line" && (
            <LineProperties id={selection.id} connections={connections} nodes={nodes} onUpdate={onUpdateConnection} allConnectionIds={allConnectionIds} />
          )}
        </div>
      )}
    </div>
  );
}

function NodeProperties({
  id, nodes, connections, regions, onSelectLayer, onSelectNode, onUpdate, allNodeIds,
}: {
  id: string; nodes: NodeData[]; connections: Connection[]; regions: RegionBounds[];
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; sub: string }>) => void;
  allNodeIds: string[];
}) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return <p className="text-xs text-slate-400">Node not found.</p>;

  const layer = regions.find((r) => r.id === node.layer);
  const Icon = node.icon;
  const iconName = (Icon as unknown as { displayName?: string }).displayName ?? Icon.name ?? "—";

  const incomingItems = connections
    .filter((c) => c.to === id)
    .map((c) => {
      const other = nodes.find((n) => n.id === c.from);
      return { id: c.from, name: other?.label ?? c.from, sub: c.label };
    });

  const outgoingItems = connections
    .filter((c) => c.from === id)
    .map((c) => {
      const other = nodes.find((n) => n.id === c.to);
      return { id: c.to, name: other?.label ?? c.to, sub: c.label };
    });

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={node.id} prefix="el-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allNodeIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={node.label} onCommit={(v) => { onUpdate?.(id, { label: v }); return true; }} />
        <EditableRow label="Sub" value={node.sub ?? ""} onCommit={(v) => { onUpdate?.(id, { sub: v }); return true; }} onClear={() => onUpdate?.(id, { sub: "" })} />
        <div className="flex items-center py-1.5 border-b border-slate-100">
          <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Icon</span>
          <span className="flex items-center gap-1.5 text-[13px] text-slate-800"><Icon size={14} className="text-slate-600" strokeWidth={1.5} />{iconName}</span>
        </div>
        <div className="flex items-center py-1.5 border-b border-slate-100">
          <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Layer</span>
          <button
            className="text-[13px] text-slate-800 hover:text-blue-600 transition-colors break-all min-w-0 text-left cursor-pointer"
            onClick={() => onSelectLayer?.(node.layer)}
          >
            {layer?.title ?? node.layer}
          </button>
        </div>
        <ExpandableListRow label="In" items={incomingItems} onSelect={onSelectNode} />
        <ExpandableListRow label="Out" items={outgoingItems} onSelect={onSelectNode} />
        <Row label="Position" value={`${Math.round(node.x)}, ${Math.round(node.y)}`} />
        <Row label="Width" value={`${node.w}px`} />
      </div>
    </div>
  );
}

function LayerProperties({
  id, regions, nodes, onSelectNode, onUpdate, allLayerIds,
}: {
  id: string; regions: RegionBounds[]; nodes: NodeData[];
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; title: string }>) => void;
  allLayerIds: string[];
}) {
  const region = regions.find((r) => r.id === id);
  if (!region) return <p className="text-xs text-slate-400">Layer not found.</p>;

  const layerNodes = nodes.filter((n) => n.layer === id);
  const nodeItems = layerNodes.map((n) => ({ id: n.id, name: n.label }));

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={region.id} prefix="ly-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allLayerIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Title" value={region.title} onCommit={(v) => { onUpdate?.(id, { title: v }); return true; }} />
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
        <Row label="Position" value={`${Math.round(region.left)}, ${Math.round(region.top)}`} />
        <Row label="Size" value={`${Math.round(region.width)} × ${Math.round(region.height)}`} />
      </div>
    </div>
  );
}

function ListItem({
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

function ExpandableListRow({
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

function DropdownRow<T extends string>({
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

function ArchitectureProperties({
  title, regions, nodes, onUpdateTitle, onSelectLayer, onSelectNode, lineCurve, onUpdateLineCurve,
}: {
  title: string; regions: RegionBounds[]; nodes: NodeData[];
  onUpdateTitle?: (title: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
}) {
  const layerItems = regions.map((r) => ({ id: r.id, name: r.title }));
  const nodeItems = nodes.map((n) => ({ id: n.id, name: n.label }));

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableRow label="Title" value={title} onCommit={(v) => { onUpdateTitle?.(v); return true; }} />
        <DropdownRow<LineCurveAlgorithm>
          label="Lines"
          value={lineCurve ?? "orthogonal"}
          options={[
            { value: "orthogonal", label: "Orthogonal" },
            { value: "bezier", label: "Bezier" },
            { value: "straight", label: "Straight" },
          ]}
          onChange={onUpdateLineCurve}
        />
        <ExpandableListRow label="Layers" items={layerItems} onSelect={onSelectLayer} />
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      </div>
    </div>
  );
}

function LineProperties({
  id, connections, nodes, onUpdate, allConnectionIds,
}: {
  id: string; connections: Connection[]; nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string }>) => void;
  allConnectionIds: string[];
}) {
  const conn = connections.find((c) => c.id === id);
  if (!conn) return <p className="text-xs text-slate-400">Connection not found.</p>;

  const fromNode = nodes.find((n) => n.id === conn.from);
  const toNode = nodes.find((n) => n.id === conn.to);

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={conn.id} prefix="dl-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allConnectionIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={conn.label} onCommit={(v) => { onUpdate?.(id, { label: v }); return true; }} />
        <Row label="From" value={fromNode?.label ?? conn.from} />
        <Row label="To" value={toNode?.label ?? conn.to} />
        <Row label="From Anchor" value={conn.fromAnchor} />
        <Row label="To Anchor" value={conn.toAnchor} />
        <Row label="Color" value={conn.color} />
      </div>
    </div>
  );
}
