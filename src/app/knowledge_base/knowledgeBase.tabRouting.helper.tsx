import type { ReactElement } from "react";
import type { PaneEntry } from "./shell/PaneManager";
import { TabView } from "./features/tab/TabView";

/**
 * Pure renderer for the `"tab"` PaneType. Lives outside the main
 * `<KnowledgeBase>` so unit tests can assert routing without the full
 * shell mount. The renderPane callback in `knowledgeBase.tsx` delegates
 * to this for `entry.fileType === "tab"`.
 */
export function renderTabPaneEntry(entry: PaneEntry): ReactElement | null {
  if (entry.fileType === "tab") {
    return <TabView filePath={entry.filePath} />;
  }
  return null;
}
