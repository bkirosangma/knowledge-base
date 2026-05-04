/**
 * Shared localStorage keys for pane-level UI state.
 *
 * Multiple panes (document / diagram / tab) persist a "properties panel
 * collapsed?" boolean. Today they share a single key so toggling collapse
 * in one pane carries to the others (which the user asked to keep). Keep
 * the key shared until somebody asks for per-pane state.
 */
export const PROPERTIES_COLLAPSED_KEY = "properties-collapsed";
