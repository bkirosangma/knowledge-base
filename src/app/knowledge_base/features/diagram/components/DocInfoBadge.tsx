"use client";

import React, { useState } from "react";

interface DocInfoBadgeProps {
  color: string;
  position: { x: number; y: number };
  documentPaths: string[];
  onNavigate: (path: string) => void;
}

export default function DocInfoBadge({ color, position, documentPaths, onNavigate }: DocInfoBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  if (documentPaths.length === 0) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (documentPaths.length === 1) {
      onNavigate(documentPaths[0]);
    } else {
      setShowDropdown(!showDropdown);
    }
  };

  return (
    <div
      style={{ position: "absolute", left: position.x, top: position.y, zIndex: 20 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        onClick={handleClick}
        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer shadow-sm border-2 border-white hover:scale-110 transition-transform"
        style={{ backgroundColor: color }}
        title={documentPaths.length === 1 ? `Open ${documentPaths[0]}` : `${documentPaths.length} documents`}
      >
        i
      </div>
      {showDropdown && documentPaths.length > 1 && (
        <div className="absolute top-6 left-0 bg-white rounded shadow-lg border border-slate-200 py-1 min-w-[140px] z-30">
          {documentPaths.map(path => (
            <button
              key={path}
              onClick={(e) => { e.stopPropagation(); onNavigate(path); setShowDropdown(false); }}
              className="block w-full text-left px-3 py-1 text-xs hover:bg-blue-50 text-blue-600 truncate"
            >
              {path.split("/").pop()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
