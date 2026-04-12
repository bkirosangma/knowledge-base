"use client";

import React from "react";
import { FileText, X, Plus } from "lucide-react";
import type { DocumentMeta } from "../../utils/types";
import { Section } from "./shared";

interface DocumentsSectionProps {
  entityType: string;
  entityId: string;
  documents: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: () => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
}

export default function DocumentsSection({
  entityType,
  entityId,
  documents,
  onOpenDocument,
  onAttachDocument,
  onDetachDocument,
}: DocumentsSectionProps) {
  const attached = documents.filter(d =>
    d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
  );

  return (
    <Section title={`Documents${attached.length > 0 ? ` (${attached.length})` : ""}`}>
      {attached.length > 0 ? (
        <div className="flex flex-col gap-1">
          {attached.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-xs group"
            >
              <FileText size={12} className="text-emerald-500 flex-shrink-0" />
              <button
                onClick={() => onOpenDocument?.(doc.filename)}
                className="text-blue-600 hover:underline truncate flex-1 text-left"
              >
                {doc.filename.split("/").pop()}
              </button>
              <button
                onClick={() => onDetachDocument?.(doc.filename, entityType, entityId)}
                className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Detach document"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No documents attached</p>
      )}
      <button
        onClick={onAttachDocument}
        className="mt-1.5 w-full text-[11px] text-blue-500 border border-dashed border-blue-300 rounded px-2 py-1 hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus size={10} /> Attach document
      </button>
    </Section>
  );
}
