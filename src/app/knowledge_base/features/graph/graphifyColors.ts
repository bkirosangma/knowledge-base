/** Relation-type → canvas color for each theme. */
export const RELATION_COLORS_DARK: Record<string, string> = {
  references:               "#60a5fa", // blue-400
  calls:                    "#34d399", // emerald-400
  implements:               "#a78bfa", // violet-400
  conceptually_related_to:  "#fb923c", // orange-400
  semantically_similar_to:  "#f472b6", // pink-400
  shares_data_with:         "#facc15", // yellow-400
  rationale_for:            "#94a3b8", // slate-400
};

export const RELATION_COLORS_LIGHT: Record<string, string> = {
  references:               "#2563eb", // blue-600
  calls:                    "#059669", // emerald-600
  implements:               "#7c3aed", // violet-600
  conceptually_related_to:  "#ea580c", // orange-600
  semantically_similar_to:  "#be185d", // pink-700
  shares_data_with:         "#b45309", // amber-700
  rationale_for:            "#475569", // slate-600
};

/** Backward-compatible alias — always the dark palette. */
export const RELATION_COLORS = RELATION_COLORS_DARK;

export function edgeColor(relation: string | undefined, isDark: boolean): string {
  const map = isDark ? RELATION_COLORS_DARK : RELATION_COLORS_LIGHT;
  const fallback = isDark ? "#475569" : "#94a3b8";
  return map[relation ?? ""] ?? fallback;
}
