import type { ReactElement } from "react";
import type { PaneEntry } from "./shell/PaneManager";
import { TabViewStub } from "./features/tab/TabViewStub";

/**
 * Pure, dependency-free renderer for the `"tab"` PaneType — extracted so
 * unit tests can assert routing without mounting the full
 * `<KnowledgeBase>` shell. The renderPane callback in `knowledgeBase.tsx`
 * delegates to this for `entry.fileType === "tab"`.
 */
export function renderTabPaneEntry(entry: PaneEntry): ReactElement | null {
  if (entry.fileType === "tab") {
    return <TabViewStub filePath={entry.filePath} />;
  }
  return null;
}
