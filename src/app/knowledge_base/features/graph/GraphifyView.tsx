"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BrainCircuit, ChevronRight, FileText, Filter, Folder, Search } from "lucide-react";
import { useRawGraphify, type RawGraphifyNode, type CommunityInfo } from "./hooks/useRawGraphify";
import { readVaultConfig, updateVaultConfig } from "../document/utils/vaultConfig";
import { DEFAULT_PHYSICS, type PhysicsConfig } from "./graphifyPhysics";

// Lazy-load canvas — react-force-graph-2d touches `window` at import.
const GraphifyCanvas = dynamic(() => import("./components/GraphifyCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
      Loading…
    </div>
  ),
});

export interface GraphifyViewProps {
  focused: boolean;
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
  /** Opens a vault file in the OPPOSITE pane. */
  onSelectNode: (filePath: string) => void;
}

export default function GraphifyView({ dirHandleRef, onSelectNode }: GraphifyViewProps) {
  const { data, hyperedges, communities, nodeColorMap, nodeSourceMap, nodeDegreeMap, status } = useRawGraphify(dirHandleRef);

  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<RawGraphifyNode | null>(null);
  const [highlightedCommunity, setHighlightedCommunity] = useState<number | null>(null);
  const [highlightedHyperedge, setHighlightedHyperedge] = useState<string | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

  // ── Node filter ──────────────────────────────────────────────────────────
  const [filterFiles, setFilterFiles] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<"include" | "exclude">("include");
  const [filterOpen, setFilterOpen] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // All unique files and their ancestor folders derived from graph nodes.
  const allFileItems = useMemo(() => {
    const files = new Set<string>();
    const folders = new Set<string>();
    for (const n of data.nodes) {
      const sf = nodeSourceMap.get(n.id) ?? n.source_file;
      if (!sf) continue;
      files.add(sf);
      const parts = sf.split("/");
      for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    }
    return { files: [...files].sort(), folders: [...folders].sort() };
  }, [data.nodes, nodeSourceMap]);

  const fileTree = useMemo(() => buildFileTree(allFileItems.files), [allFileItems.files]);

  // Flat list used when treeSearch is active.
  const filteredFlatItems = useMemo(() => {
    if (!treeSearch.trim()) return [];
    const q = treeSearch.toLowerCase();
    const folderItems = allFileItems.folders
      .filter(f => f.toLowerCase().includes(q))
      .map(f => ({ path: f, isFolder: true }));
    const fileItems = allFileItems.files
      .filter(f => f.toLowerCase().includes(q))
      .map(f => ({ path: f, isFolder: false }));
    return [...folderItems, ...fileItems];
  }, [allFileItems, treeSearch]);

  // Nodes that survive the active file filter.
  const filteredNodeIds = useMemo<Set<string> | null>(() => {
    if (filterFiles.size === 0) return null;
    const matchedIds = new Set<string>();
    for (const n of data.nodes) {
      const sf = nodeSourceMap.get(n.id) ?? n.source_file;
      if (!sf) continue;
      for (const f of filterFiles) {
        if (sf === f || sf.startsWith(f + "/")) { matchedIds.add(n.id); break; }
      }
    }
    if (filterMode === "exclude") {
      return new Set(data.nodes.filter(n => !matchedIds.has(n.id)).map(n => n.id));
    }
    // include + direct neighbors via any link
    const result = new Set(matchedIds);
    for (const l of data.links) {
      const src = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
      if (matchedIds.has(src)) result.add(tgt);
      if (matchedIds.has(tgt)) result.add(src);
    }
    return result;
  }, [filterFiles, filterMode, data.nodes, data.links, nodeSourceMap]);

  const toggleFilter = useCallback((path: string) => {
    setFilterFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const toggleExpandFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // Visible node IDs: intersection of filter (when active) and highlight (when active).
  const visibleNodeIds = useMemo<Set<string> | null>(() => {
    let highlightIds: Set<string> | null = null;
    if (highlightedCommunity !== null) {
      highlightIds = new Set(data.nodes.filter(n => n.community === highlightedCommunity).map(n => n.id));
    } else if (highlightedHyperedge !== null) {
      const he = hyperedges.find(h => h.id === highlightedHyperedge);
      highlightIds = he ? new Set(he.nodes) : null;
    }
    if (!filteredNodeIds && !highlightIds) return null;
    if (filteredNodeIds && !highlightIds) return filteredNodeIds;
    if (!filteredNodeIds && highlightIds) return highlightIds;
    return new Set([...highlightIds!].filter(id => filteredNodeIds!.has(id)));
  }, [filteredNodeIds, highlightedCommunity, highlightedHyperedge, data.nodes, hyperedges]);

  const searchRef = useRef<HTMLInputElement>(null);
  const [physics, setPhysics] = useState<PhysicsConfig>(DEFAULT_PHYSICS);

  // Load saved physics once the vault is open.
  useEffect(() => {
    if (status !== "loaded") return;
    const root = dirHandleRef.current;
    if (!root) return;
    readVaultConfig(root)
      .then(cfg => { if (cfg.graphifyPhysics) setPhysics({ ...DEFAULT_PHYSICS, ...cfg.graphifyPhysics }); })
      .catch(() => {});
  // dirHandleRef is a stable ref — status is the correct trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handlePhysicsChange = useCallback((c: PhysicsConfig) => {
    setPhysics(c);
    const root = dirHandleRef.current;
    if (root) updateVaultConfig(root, { graphifyPhysics: c }).catch(() => {});
  }, [dirHandleRef]);

  // Search results — match label or source_file
  const searchResults: RawGraphifyNode[] = search.trim()
    ? data.nodes
        .filter((n) =>
          n.label.toLowerCase().includes(search.toLowerCase()) ||
          (n.source_file ?? "").toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 20)
    : [];

  const handleNodeClick = useCallback((node: RawGraphifyNode) => {
    setSelectedNode(node);
    setSearch("");
    setHighlightedNode(node.id);
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedNode(null);
    setHighlightedNode(null);
  }, []);

  const handleHyperedgeClick = useCallback((he: { id: string }) => {
    setHighlightedHyperedge(prev => prev === he.id ? null : he.id);
    setHighlightedCommunity(null);
  }, []);

  const handleOpenFile = useCallback((node: RawGraphifyNode) => {
    const filePath = nodeSourceMap.get(node.id) ?? node.source_file;
    if (filePath) onSelectNode(filePath);
  }, [nodeSourceMap, onSelectNode]);

  // Neighbors of the selected node
  const neighbors: { node: RawGraphifyNode; relation: string; direction: "out" | "in" }[] = [];
  if (selectedNode) {
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));
    for (const l of data.links) {
      const srcId = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
      const tgtId = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
      if (srcId === selectedNode.id) {
        const tgt = nodeMap.get(tgtId);
        if (tgt) neighbors.push({ node: tgt, relation: l.relation ?? "→", direction: "out" });
      } else if (tgtId === selectedNode.id) {
        const src = nodeMap.get(srcId);
        if (src) neighbors.push({ node: src, relation: l.relation ?? "←", direction: "in" });
      }
    }
  }

  // Escape clears search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSearch(""); setHighlightedNode(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const numCommunities = communities.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full" data-testid="graphify-view">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line bg-surface"
        data-testid="graphify-pane-header"
      >
        <BrainCircuit size={14} className="text-mute" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink">Knowledge graph</span>
        {status === "loaded" && (
          <span className="text-xs text-mute">
            {data.nodes.length} node{data.nodes.length === 1 ? "" : "s"} · {data.links.length} edge{data.links.length === 1 ? "" : "s"} · {numCommunities} communit{numCommunities === 1 ? "y" : "ies"}
          </span>
        )}
      </div>

      {/* Body */}
      {status === "idle" ? (
        <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
          Open a vault to view the knowledge graph.
        </div>
      ) : status === "loading" ? (
        <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
          Loading knowledge graph…
        </div>
      ) : status === "missing" ? (
        <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm px-6 text-center">
          Run <code className="mx-1 px-1 bg-surface rounded font-mono text-xs">graphify . --update</code> inside the vault to build the knowledge graph.
        </div>
      ) : status === "error" ? (
        <div className="flex-1 flex items-center justify-center bg-surface-2 text-danger text-sm">
          Could not parse graphify-out/graph.json
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-line bg-surface">
            <div className="relative flex-1 max-w-[160px]">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-mute pointer-events-none" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nodes…"
                className="w-full bg-surface-2 border border-line rounded pl-6 pr-2 py-1 text-xs text-ink placeholder:text-mute outline-none focus:border-accent"
                aria-label="Search nodes"
              />
            </div>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border transition-colors ${filterFiles.size > 0 || filterOpen ? "border-accent/50 text-accent bg-accent/10" : "border-line text-mute hover:text-ink"}`}
              onClick={() => setFilterOpen(v => !v)}
              aria-expanded={filterOpen}
              aria-label="Toggle node filter"
            >
              <Filter size={12} aria-hidden="true" />
              <span>Filter</span>
              {filterFiles.size > 0 && (
                <span className="font-medium tabular-nums">{filterFiles.size}</span>
              )}
            </button>
          </div>

          {/* Search results — absolute overlay so the canvas never shifts */}
          {searchResults.length > 0 && (
            <div className="absolute left-2 top-9 z-30 w-56 bg-surface border border-line rounded-b shadow-lg overflow-hidden">
              <ul className="max-h-48 overflow-y-auto py-1" role="listbox" aria-label="Search results">
                {searchResults.map((n) => (
                  <li
                    key={n.id}
                    role="option"
                    aria-selected={selectedNode?.id === n.id}
                    className="px-2 py-1 text-xs cursor-pointer text-ink truncate hover:bg-surface-2"
                    style={{ borderLeft: `3px solid ${nodeColorMap.get(n.id) ?? "#888"}` }}
                    onClick={() => handleNodeClick(n)}
                  >
                    {n.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filter panel — absolute overlay anchored to right of toolbar */}
          {filterOpen && (
            <div className="absolute right-2 top-9 z-30 w-64 bg-surface border border-line rounded-b shadow-lg px-3 py-2">
              {/* Mode toggle */}
              <div className="flex gap-1 mb-2">
                <button
                  type="button"
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${filterMode === "include" ? "border-accent/50 text-accent bg-accent/10" : "border-line text-mute hover:text-ink"}`}
                  onClick={() => setFilterMode("include")}
                >Include + neighbors</button>
                <button
                  type="button"
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${filterMode === "exclude" ? "border-accent/50 text-accent bg-accent/10" : "border-line text-mute hover:text-ink"}`}
                  onClick={() => setFilterMode("exclude")}
                >Exclude</button>
              </div>

              {/* Tree search */}
              <input
                type="text"
                value={treeSearch}
                onChange={e => setTreeSearch(e.target.value)}
                placeholder="Search files…"
                className="w-full bg-surface-2 border border-line rounded px-2 py-1 text-xs text-ink placeholder:text-mute outline-none focus:border-accent mb-2"
              />

              {/* File tree or filtered flat list */}
              <div className="max-h-48 overflow-y-auto -mx-1">
                {treeSearch.trim() ? (
                  filteredFlatItems.length === 0 ? (
                    <p className="text-[10px] text-mute italic px-1">No files found</p>
                  ) : (
                    filteredFlatItems.map(item => (
                      <label key={item.path} className="flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={filterFiles.has(item.path)}
                          onChange={() => toggleFilter(item.path)}
                          className="w-3 h-3 flex-shrink-0 accent-blue-400"
                        />
                        {item.isFolder
                          ? <Folder size={10} className="text-mute flex-shrink-0" />
                          : <FileText size={10} className="text-mute flex-shrink-0" />
                        }
                        <span className="text-[10px] text-ink truncate" title={item.path}>
                          {item.path}{item.isFolder ? "/" : ""}
                        </span>
                      </label>
                    ))
                  )
                ) : (
                  fileTree.length === 0 ? (
                    <p className="text-[10px] text-mute italic px-1">No files found</p>
                  ) : (
                    fileTree.map(node => (
                      <FileTreeItem
                        key={node.path}
                        node={node}
                        depth={0}
                        filterFiles={filterFiles}
                        expandedFolders={expandedFolders}
                        onToggleFilter={toggleFilter}
                        onToggleExpand={toggleExpandFolder}
                      />
                    ))
                  )
                )}
              </div>

              {filterFiles.size > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-mute hover:text-ink mt-2"
                  onClick={() => setFilterFiles(new Set())}
                >Clear filter</button>
              )}
            </div>
          )}

          {/* Canvas + sidebar */}
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <GraphifyCanvas
              nodes={data.nodes}
              links={data.links}
              hyperedges={hyperedges}
              nodeColorMap={nodeColorMap}
              nodeDegreeMap={nodeDegreeMap}
              visibleNodeIds={visibleNodeIds}
              highlightedNode={highlightedNode}
              onNodeClick={handleNodeClick}
              onHyperedgeClick={handleHyperedgeClick}
              onBackgroundClick={handleDeselect}
              physicsConfig={physics}
              onPhysicsChange={handlePhysicsChange}
            />

            {/* Sidebar */}
            <aside
              className="w-64 flex-shrink-0 flex flex-col border-l border-line bg-surface overflow-hidden"
              aria-label="Graph sidebar"
            >
              {/* Node info */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-line min-h-[120px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-mute mb-1">Node info</p>
                {selectedNode ? (
                  <div className="text-xs text-ink space-y-1">
                    <div className="font-medium leading-snug">{selectedNode.label}</div>
                    {(nodeSourceMap.get(selectedNode.id) ?? selectedNode.source_file) && (
                      <button
                        className="text-accent hover:underline truncate block w-full text-left"
                        title={nodeSourceMap.get(selectedNode.id) ?? selectedNode.source_file}
                        onClick={() => handleOpenFile(selectedNode)}
                      >
                        {(nodeSourceMap.get(selectedNode.id) ?? selectedNode.source_file ?? "").split("/").pop()}
                      </button>
                    )}
                    {selectedNode.community != null && (
                      <button
                        className={`flex items-center gap-1 w-full text-left rounded transition-opacity ${highlightedCommunity === selectedNode.community ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
                        title="Click to highlight this community"
                        onClick={() => {
                          setHighlightedCommunity(prev => prev === selectedNode.community ? null : selectedNode.community!);
                          setHighlightedHyperedge(null);
                        }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: nodeColorMap.get(selectedNode.id) ?? "#888" }}
                        />
                        <span className="text-mute">
                          {communities.find((c) => c.id === selectedNode.community)?.name ?? `Community ${selectedNode.community}`}
                        </span>
                      </button>
                    )}
                    {neighbors.length > 0 && (
                      <div>
                        <p className="text-mute mt-1 mb-0.5">Neighbors ({neighbors.length})</p>
                        <ul className="max-h-24 overflow-y-auto space-y-0.5">
                          {neighbors.slice(0, 15).map(({ node: nb, relation, direction }, i) => (
                            <li key={`${nb.id}-${i}`}>
                              <button
                                className="w-full text-left hover:text-accent"
                                style={{ borderLeft: `2px solid ${nodeColorMap.get(nb.id) ?? "#888"}`, paddingLeft: 4 }}
                                onClick={() => handleNodeClick(nb)}
                              >
                                <span className="truncate block leading-tight">{direction === "out" ? "→" : "←"} {nb.label}</span>
                                {relation && relation !== "→" && relation !== "←" && (
                                  <span className="text-[9px] text-mute italic">{relation}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-mute italic">Click a node to inspect it</p>
                )}
              </div>

              {/* Community legend */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-line">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-mute mb-1">Communities</p>
                <ul className="space-y-0.5">
                  {communities.map((c) => (
                    <CommunityRow
                      key={c.id}
                      community={c}
                      highlighted={highlightedCommunity === c.id}
                      onToggle={() => {
                        setHighlightedCommunity((prev) => prev === c.id ? null : c.id);
                        setHighlightedHyperedge(null);
                      }}
                    />
                  ))}
                </ul>
              </div>

              {/* Hyperedge list */}
              {hyperedges.length > 0 && (
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-mute mb-1">Hyperedges</p>
                  <ul className="space-y-0.5">
                    {hyperedges.map((he) => (
                      <HyperedgeRow
                        key={he.id}
                        hyperedge={he}
                        highlighted={highlightedHyperedge === he.id}
                        onToggle={() => {
                          setHighlightedHyperedge((prev) => prev === he.id ? null : he.id);
                          setHighlightedCommunity(null);
                        }}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {hyperedges.length === 0 && <div className="flex-1" />}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File tree helpers ────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildFileTree(filePaths: string[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const fp of filePaths) {
    const parts = fp.split("/");
    let siblings = roots;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join("/");
      const isFolder = i < parts.length - 1;
      if (!nodeMap.has(path)) {
        const node: TreeNode = { name, path, isFolder, children: [] };
        nodeMap.set(path, node);
        siblings.push(node);
      }
      siblings = nodeMap.get(path)!.children;
    }
  }

  function sortNodes(nodes: TreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(roots);

  return roots;
}

function FileTreeItem({
  node,
  depth,
  filterFiles,
  expandedFolders,
  onToggleFilter,
  onToggleExpand,
}: {
  node: TreeNode;
  depth: number;
  filterFiles: Set<string>;
  expandedFolders: Set<string>;
  onToggleFilter: (path: string) => void;
  onToggleExpand: (path: string) => void;
}) {
  const expanded = expandedFolders.has(node.path);
  return (
    <>
      <div
        className="flex items-center gap-1 py-0.5 rounded hover:bg-surface-2"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {node.isFolder ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.path)}
            className="flex-shrink-0 text-mute hover:text-ink p-0 leading-none"
            aria-label={expanded ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRight
              size={10}
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="w-[10px] flex-shrink-0" />
        )}
        <label className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={filterFiles.has(node.path)}
            onChange={() => onToggleFilter(node.path)}
            className="w-3 h-3 flex-shrink-0 accent-blue-400"
          />
          {node.isFolder
            ? <Folder size={10} className="text-mute flex-shrink-0" aria-hidden="true" />
            : <FileText size={10} className="text-mute flex-shrink-0" aria-hidden="true" />
          }
          <span className="text-[10px] text-ink truncate" title={node.path}>
            {node.name}{node.isFolder ? "/" : ""}
          </span>
        </label>
      </div>
      {node.isFolder && expanded && node.children.map(child => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          filterFiles={filterFiles}
          expandedFolders={expandedFolders}
          onToggleFilter={onToggleFilter}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  );
}

function HyperedgeRow({
  hyperedge,
  highlighted,
  onToggle,
}: {
  hyperedge: { id: string; label: string; nodes: string[]; relation?: string };
  highlighted: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        className={`flex items-center gap-2 w-full text-left px-1 py-0.5 rounded text-xs transition-opacity ${highlighted ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
        onClick={onToggle}
        title={`${hyperedge.label}${hyperedge.relation ? ` (${hyperedge.relation})` : ""} — ${hyperedge.nodes.length} nodes`}
      >
        <span className="inline-block w-2.5 h-2.5 rounded flex-shrink-0 border border-[rgba(148,163,184,0.5)]"
          style={{ background: "rgba(148,163,184,0.15)" }} />
        <span className="flex-1 text-ink truncate">{hyperedge.label}</span>
        <span className="text-mute text-[10px]">{hyperedge.nodes.length}</span>
      </button>
    </li>
  );
}

function CommunityRow({
  community,
  highlighted,
  onToggle,
}: {
  community: CommunityInfo;
  highlighted: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        className={`flex items-center gap-2 w-full text-left px-1 py-0.5 rounded text-xs transition-opacity ${highlighted ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
        onClick={onToggle}
        title={`${community.name} — ${community.count} nodes`}
      >
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: community.color }}
        />
        <span className="flex-1 text-ink truncate">{community.name}</span>
        <span className="text-mute text-[10px]">{community.count}</span>
      </button>
    </li>
  );
}
