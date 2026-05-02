"use client";

import type { ReactElement } from "react";

/**
 * Placeholder for the guitar-tab pane. Wired into `handleSelectFile` and
 * the renderPane branch in `knowledgeBase.tsx` so `.alphatex` files open
 * a "tab" pane today; TAB-004 replaces this with the real `TabView`
 * that mounts an `AlphaTabEngine` and renders the score.
 */
export function TabViewStub({ filePath }: { filePath: string }): ReactElement {
  return (
    <div
      data-testid="tab-view-stub"
      className="flex h-full w-full items-center justify-center bg-surface text-mute"
    >
      <div className="text-center">
        <p className="text-sm font-medium">Guitar tab viewer coming in TAB-004</p>
        <p className="mt-1 text-xs">{filePath}</p>
      </div>
    </div>
  );
}
