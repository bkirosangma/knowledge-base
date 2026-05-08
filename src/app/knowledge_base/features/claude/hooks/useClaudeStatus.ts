import { useCallback, useEffect, useState } from "react";
import { tauriBridge } from "../../../infrastructure/tauriBridge";
import type { ClaudeStatus } from "../types";

const UNKNOWN: ClaudeStatus = { binary: "unknown", auth: "unknown" };

export function useClaudeStatus() {
  const [status, setStatus] = useState<ClaudeStatus>(UNKNOWN);

  const refresh = useCallback(async () => {
    try {
      const next = await tauriBridge.claudeStatus();
      setStatus(next);
    } catch {
      setStatus({ binary: "missing", auth: "unknown" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}
