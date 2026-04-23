"use client";

import React from "react";
import { FileText } from "lucide-react";
import { Section } from "./shared";

interface DocumentsSectionProps {
  backlinks: { sourcePath: string; section?: string }[];
  onPreviewDocument?: (path: string) => void;
}

export default function DocumentsSection({
  backlinks,
  onPreviewDocument,
}: DocumentsSectionProps) {
  const unique = backlinks.filter(
    (bl, i, arr) =>
      arr.findIndex(
        (b) => b.sourcePath === bl.sourcePath && (b.section ?? "") === (bl.section ?? ""),
      ) === i,
  );
  return (
    <Section title={`References${unique.length > 0 ? ` (${unique.length})` : ""}`}>
      {unique.length > 0 ? (
        <div className="flex flex-col gap-1">
          {unique.map((bl) => (
            <div
              key={`${bl.sourcePath}#${bl.section ?? ""}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-xs"
            >
              <FileText size={12} className="text-emerald-500 flex-shrink-0" />
              <button
                onClick={() => onPreviewDocument?.(bl.sourcePath)}
                className="text-blue-600 hover:underline truncate flex-1 text-left"
              >
                {bl.sourcePath.split("/").pop()}
                {bl.section ? ` #${bl.section}` : ""}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No documents reference this diagram</p>
      )}
      <p className="mt-1.5 text-[10px] text-slate-400">
        Add references via <code className="bg-slate-100 px-0.5 rounded">[[wiki-links]]</code> in documents
      </p>
    </Section>
  );
}
