import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface ToolUseBlockProps {
  tool: string;
  input: unknown;
  output?: unknown;
}

function formatBody(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function ToolUseBlock({ tool, input, output }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded-md border border-line bg-surface-2 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full cursor-pointer items-center gap-1 px-2 py-1 text-left text-mute hover:bg-surface"
        aria-expanded={expanded}
      >
        <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="font-mono">{tool}</span>
      </button>
      {expanded && (
        <div className="border-t border-line p-2">
          <div className="text-mute">input</div>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-ink">{formatBody(input)}</pre>
          {output !== undefined && (
            <>
              <div className="mt-2 text-mute">output</div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-ink">{formatBody(output)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
