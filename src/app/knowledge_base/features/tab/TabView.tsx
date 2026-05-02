"use client";

import { useEffect, useRef } from "react";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { TabCanvas } from "./components/TabCanvas";
import { useTabContent } from "./hooks/useTabContent";
import { useTabEngine } from "./hooks/useTabEngine";

/**
 * Pane shell for an opened `.alphatex` file. Reads the file via
 * `useTabContent`, hands the text to `useTabEngine.mountInto()` along
 * with a host div ref, and swaps between loading / canvas / error
 * chrome based on engine status.
 */
export function TabView({ filePath }: { filePath: string }) {
  const { content, loadError } = useTabContent(filePath);
  // Destructure so the effects below depend on stable callbacks +
  // primitive values, not the whole hook-return object (whose identity
  // changes every render — would re-trigger mountInto on every status
  // update and loop).
  const { status, error: engineError, mountInto } = useTabEngine();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { reportError } = useShellErrors();

  useEffect(() => {
    if (!canvasRef.current || content === null) return;
    void mountInto(canvasRef.current, content);
  }, [content, mountInto]);

  useEffect(() => {
    if (loadError) reportError(loadError, `Loading ${filePath}`);
  }, [loadError, filePath, reportError]);

  useEffect(() => {
    if (status === "error" && engineError) {
      reportError(engineError, `Parsing ${filePath}`);
    }
  }, [status, engineError, filePath, reportError]);

  return (
    <div className="relative flex h-full w-full flex-col">
      {status === "mounting" && (
        <div
          data-testid="tab-view-loading"
          className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-mute"
        >
          Loading score…
        </div>
      )}
      {status === "engine-load-error" && (
        <div
          data-testid="tab-view-engine-error"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface text-mute"
        >
          <p className="text-sm font-medium">Couldn&apos;t load the guitar-tab engine.</p>
          <p className="text-xs">{engineError?.message}</p>
          <button
            type="button"
            className="rounded border border-line px-3 py-1 text-sm hover:bg-line/20"
            onClick={() => {
              if (canvasRef.current && content !== null) {
                void mountInto(canvasRef.current, content);
              }
            }}
          >
            Reload
          </button>
        </div>
      )}
      <TabCanvas ref={canvasRef} />
    </div>
  );
}
