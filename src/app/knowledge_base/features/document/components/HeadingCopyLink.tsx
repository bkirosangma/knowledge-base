"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Vault-relative filename of the document containing this heading.
   *  Accepts a string (mounted standalone, e.g. tests) or a getter read at
   *  click-time so file-switches inside the editor refresh the copied
   *  wiki-link target without re-rendering the NodeView. */
  currentDocFilename: string | (() => string | undefined);
  headerId: string;
}

function resolveFilename(
  source: Props["currentDocFilename"],
): string | undefined {
  return typeof source === "string" ? source : source();
}

export function HeadingCopyLink({ currentDocFilename, headerId }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      contentEditable={false}
      data-testid={`heading-copy-link-${headerId}`}
      title="Copy link to this heading"
      aria-label="Copy link to this heading"
      onMouseDown={(e) => e.preventDefault()}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filename = resolveFilename(currentDocFilename);
        if (!filename) return;
        await navigator.clipboard.writeText(`[[${filename}#${headerId}]]`);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-slate-500 hover:text-slate-800"
    >
      {copied ? "Copied!" : <Link2 size={12} />}
    </button>
  );
}
