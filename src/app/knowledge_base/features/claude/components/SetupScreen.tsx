import { useClaudeStatus } from "../hooks/useClaudeStatus";

export function SetupScreen() {
  const { refresh } = useClaudeStatus();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
      <h2 className="text-base font-semibold text-white">Install Claude</h2>
      <p className="text-mute">
        The <code className="rounded bg-black/30 px-1">claude</code> CLI isn&apos;t on your PATH.
      </p>
      <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white">
        curl -fsSL https://claude.ai/install.sh | sh
      </pre>
      <p className="text-xs text-mute">
        After install, open a new terminal session, then click Refresh.
      </p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="cursor-pointer rounded-md bg-accent px-3 py-1 text-white hover:bg-accent/80"
      >
        Refresh
      </button>
    </div>
  );
}
