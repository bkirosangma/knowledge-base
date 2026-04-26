/**
 * Class string for diagram-toolbar pill buttons. Active pill gets a shadow +
 * accent text + visible border; inactive is muted text with a transparent
 * border. Tokenised for dark-mode coherence (Phase 3 PR 1).
 */
export const toggleClass = (active: boolean): string =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
    active
      ? "bg-surface shadow-sm text-accent border border-line"
      : "text-mute hover:text-ink-2 border border-transparent"
  }`;
