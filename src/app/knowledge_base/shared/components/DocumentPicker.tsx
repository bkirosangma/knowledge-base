// src/app/knowledge_base/components/DocumentPicker.tsx
"use client";

import React, { useState, useMemo } from "react";
import { FileText, Plus, X, Search } from "lucide-react";

interface DocumentPickerProps {
  allDocPaths: string[];
  attachedPaths: string[];        // already attached to this entity
  onAttach: (path: string) => void;
  onCreate: (path: string) => void;
  onClose: () => void;
}

export default function DocumentPicker({
  allDocPaths,
  attachedPaths,
  onAttach,
  onCreate,
  onClose,
}: DocumentPickerProps) {
  const [search, setSearch] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const attachedSet = useMemo(() => new Set(attachedPaths), [attachedPaths]);

  const filtered = useMemo(() => {
    if (!search) return allDocPaths.filter(p => !attachedSet.has(p));
    const lower = search.toLowerCase();
    return allDocPaths.filter(p => !attachedSet.has(p) && p.toLowerCase().includes(lower));
  }, [allDocPaths, attachedSet, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-80 max-h-96 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Attach Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded border border-slate-200">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="flex-1 text-xs bg-transparent outline-none"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-auto px-2 py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No documents found</p>
          )}
          {filtered.map(path => (
            <button
              key={path}
              onClick={() => { onAttach(path); onClose(); }}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 text-xs"
            >
              <FileText size={12} className="text-emerald-500" />
              <span className="text-slate-700 truncate">{path}</span>
            </button>
          ))}
        </div>

        {/* Create new */}
        <div className="px-4 py-2 border-t border-slate-200">
          {showCreate ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newDocName}
                onChange={e => setNewDocName(e.target.value)}
                placeholder="docs/new-document.md"
                className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-400"
                onKeyDown={e => {
                  if (e.key === "Enter" && newDocName.trim()) {
                    const path = newDocName.endsWith(".md") ? newDocName : `${newDocName}.md`;
                    onCreate(path);
                    onClose();
                  }
                  if (e.key === "Escape") setShowCreate(false);
                }}
              />
              <button
                onClick={() => {
                  if (newDocName.trim()) {
                    const path = newDocName.endsWith(".md") ? newDocName : `${newDocName}.md`;
                    onCreate(path);
                    onClose();
                  }
                }}
                className="text-xs px-2 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700"
            >
              <Plus size={12} /> Create new document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
