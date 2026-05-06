"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  currentDocFilename: string;
  headerId: string;
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
        await navigator.clipboard.writeText(
          `[[${currentDocFilename}#${headerId}]]`,
        );
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
