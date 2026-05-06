import { Lock } from "lucide-react";

interface LockBannerProps {
  flowName: string;
  onUnlock: () => void;
}

export function LockBanner({ flowName, onUnlock }: LockBannerProps) {
  return (
    <div
      data-testid="lock-banner"
      className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-full shadow-sm"
    >
      <Lock size={12} />
      <span>{flowName}</span>
      <button
        type="button"
        data-testid="lock-banner-unlock"
        onClick={onUnlock}
        className="ml-1 px-2 py-0.5 text-amber-900 bg-amber-200 hover:bg-amber-300 rounded"
      >
        Unlock
      </button>
    </div>
  );
}
