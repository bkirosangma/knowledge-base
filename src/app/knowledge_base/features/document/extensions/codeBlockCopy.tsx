// src/app/knowledge_base/features/document/extensions/codeBlockCopy.tsx
// Extends Tiptap's CodeBlock with a React NodeView that adds a copy button
// in the top-right corner of each rendered code block.
"use client";

import { useRef, useState } from "react";
import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Copy, Check } from "lucide-react";

function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
    } catch {
      // Clipboard write can fail in sandboxed or permission-denied contexts.
      // Fall back to a temporary textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = node.textContent;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <NodeViewWrapper className="md-codeblock-wrapper relative group">
      <pre>
        <NodeViewContent as="code" />
      </pre>
      <button
        type="button"
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleCopy}
        title={copied ? "Copied" : "Copy code"}
        aria-label={copied ? "Copied" : "Copy code"}
        className="md-codeblock-copy absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2 py-1 rounded-md bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white text-xs inline-flex items-center gap-1"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
