import { useChat } from "../../features/claude/ChatContext";
import { useClaudeStatus } from "../../features/claude/hooks/useClaudeStatus";
import { useClaudeUsage } from "../../features/claude/hooks/useClaudeUsage";

interface ClaudeStatusLineProps {
  vaultName: string;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function ClaudeStatusLine({ vaultName }: ClaudeStatusLineProps) {
  const { errorMessage, reset } = useChat();
  const { status } = useClaudeStatus();
  const { model, inputTokens, outputTokens, costUsd } = useClaudeUsage();

  const vaultClause = vaultName ? ` · vault: ${vaultName}` : "";

  if (status.binary === "unknown") return null;

  if (errorMessage?.startsWith("Claude crashed")) {
    return (
      <span className="text-xs text-red-400 tabular-nums">
        claude: failing to start{" "}
        <button
          type="button"
          onClick={() => void reset()}
          className="cursor-pointer underline hover:text-red-300"
        >
          Retry
        </button>
      </span>
    );
  }

  if (status.binary === "missing") {
    return (
      <span className="text-[11px] text-amber-400 font-mono tabular-nums">
        claude: not installed
      </span>
    );
  }

  if (status.auth === "api_key") {
    return (
      <span className="text-[11px] text-amber-400 font-mono tabular-nums">
        {`claude: api-key billing (not subscription)${vaultClause}`}
      </span>
    );
  }

  if (model === null) {
    return (
      <span className="text-[11px] text-mute font-mono tabular-nums">
        {`claude: idle${vaultClause}`}
      </span>
    );
  }

  return (
    <span className="text-[11px] text-mute font-mono tabular-nums">
      <span className="text-white">{model}</span>
      {` · ${formatTokens(inputTokens)} in / ${formatTokens(outputTokens)} out · ${formatCost(costUsd)}${vaultClause}`}
    </span>
  );
}
