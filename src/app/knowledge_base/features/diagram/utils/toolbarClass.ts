/**
 * Class string for diagram-toolbar pill buttons. Active pill gets a shadow +
 * blue text + visible border; inactive is slate text with a transparent border.
 */
export const toggleClass = (active: boolean): string =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
    active
      ? "bg-white shadow-sm text-blue-600 border border-slate-200"
      : "text-slate-500 hover:text-slate-700 border border-transparent"
  }`;
