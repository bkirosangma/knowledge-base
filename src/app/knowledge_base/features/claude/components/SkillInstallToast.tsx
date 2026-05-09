import { useEffect, useState } from "react";

interface Props {
  /** When true, the toast shows for ~3 seconds then auto-dismisses. */
  show: boolean;
  message?: string;
  /** 'success' (default) — neutral; 'error' — red + role="alert" */
  tone?: 'success' | 'error';
}

export function SkillInstallToast({
  show,
  message = "knowledge-base skill installed.",
  tone = 'success',
}: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;
  const isError = tone === 'error';
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={
        "absolute right-4 top-4 z-50 rounded-md px-3 py-2 text-xs shadow-lg " +
        (isError
          ? "border border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400"
          : "border border-line bg-surface-2 text-ink")
      }
    >
      {message}
    </div>
  );
}
