import { useEffect, useState } from "react";

interface Props {
  /** When true, the toast shows for ~3 seconds then auto-dismisses. */
  show: boolean;
  message?: string;
}

export function SkillInstallToast({ show, message = "knowledge-base skill installed." }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-4 top-4 z-50 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink shadow-lg"
    >
      {message}
    </div>
  );
}
