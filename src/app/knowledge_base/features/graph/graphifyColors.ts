/** Relation-type → canvas color, tuned for the dark graph background. */
export const RELATION_COLORS: Record<string, string> = {
  references:               "#60a5fa", // blue-400
  calls:                    "#34d399", // emerald-400
  implements:               "#a78bfa", // violet-400
  conceptually_related_to:  "#fb923c", // orange-400
  semantically_similar_to:  "#f472b6", // pink-400
  shares_data_with:         "#facc15", // yellow-400
  rationale_for:            "#94a3b8", // slate-400
};

export const EDGE_FALLBACK = "#475569";

export function edgeColor(relation: string | undefined): string {
  return RELATION_COLORS[relation ?? ""] ?? EDGE_FALLBACK;
}
