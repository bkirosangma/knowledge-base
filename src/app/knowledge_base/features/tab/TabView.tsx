"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useObservedTheme } from "../../shared/hooks/useObservedTheme";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { TabCanvas } from "./components/TabCanvas";
import { TabToolbar } from "./components/TabToolbar";
import { useTabContent } from "./hooks/useTabContent";
import { useTabEngine } from "./hooks/useTabEngine";
import { useTabPlayback } from "./hooks/useTabPlayback";
import { TabProperties } from "./properties/TabProperties";
import type { DocumentMeta } from "../document/types";
import { useTabSectionSync } from "./properties/useTabSectionSync";
import DocumentPicker from "../../shared/components/DocumentPicker";

const noopMigrate = () => {};

/**
 * Pane shell for an opened `.alphatex` file. Reads the file via
 * `useTabContent`, hands the text to `useTabEngine.mountInto()` along
 * with a host div ref, mounts a `TabToolbar` above the canvas (when the
 * engine is in a renderable state), and pushes theme changes from
 * `useObservedTheme()` into the engine via a no-op render call (alphatab
 * picks up the new colours from its settings on the next layout).
 *
 * Source-parse failures (`status === "error"`) forward to the global
 * `ShellErrorContext` banner. Engine-module load failures
 * (`status === "engine-load-error"`) render an inline error pane with a
 * Reload button.
 */
export interface TabViewProps {
  filePath: string;
  documents?: DocumentMeta[];
  backlinks?: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreviewDocument?: (path: string) => void;
  onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  onAttachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  onCreateDocument?: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<unknown>;
  getDocumentsForEntity?: (entityType: string, entityId: string) => DocumentMeta[];
  allDocPaths?: string[];
  rootHandle?: FileSystemDirectoryHandle | null;
  onMigrateAttachments?: (
    filePath: string,
    migrations: { from: string; to: string }[],
  ) => void;
}

export function TabView({
  filePath,
  documents,
  backlinks,
  readOnly,
  onPreviewDocument,
  onDetachDocument,
  onAttachDocument,
  onCreateDocument,
  getDocumentsForEntity,
  allDocPaths,
  rootHandle,
  onMigrateAttachments,
}: TabViewProps) {
  const { content, loadError } = useTabContent(filePath);
  const {
    status,
    error: engineError,
    mountInto,
    metadata,
    currentTick,
    playerStatus,
    isAudioReady,
    session,
  } = useTabEngine();
  const playback = useTabPlayback({ session, isAudioReady, playerStatus, currentTick });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("properties-collapsed") === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("properties-collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const { reportError } = useShellErrors();
  const theme = useObservedTheme();

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

  // Theme push — when the observed theme changes after the engine is
  // ready, ask alphatab to re-render so the new chrome (background +
  // staff lines) flips. The score colours themselves are styled via
  // CSS variables on the canvas host; a re-render is enough.
  useEffect(() => {
    if (status !== "ready" || !session) return;
    session.render();
  }, [theme, status, session]);

  const [pickerTarget, setPickerTarget] = useState<
    { type: "tab" | "tab-section"; id: string } | null
  >(null);

  useTabSectionSync(
    filePath,
    metadata,
    onMigrateAttachments ?? noopMigrate,
  );

  if (status === "engine-load-error") {
    return (
      <div className="relative flex h-full w-full flex-col">
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
        <TabCanvas ref={canvasRef} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <div className="relative flex flex-1 flex-col">
        <TabToolbar
          playerStatus={playback.playerStatus}
          isAudioReady={isAudioReady}
          audioBlocked={playback.audioBlocked}
          onToggle={playback.toggle}
          onStop={playback.stop}
          onSetTempoFactor={playback.setTempoFactor}
          onSetLoop={playback.setLoop}
        />
        {status === "mounting" && (
          <div
            data-testid="tab-view-loading"
            className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-mute"
          >
            Loading score…
          </div>
        )}
        {/* KB-040 / TAB-008: when an editor surface lands, lazy-load it via
            `next/dynamic({ ssr: false })` and gate behind `!readOnly` so the
            chunk is excluded from the mobile bundle. */}
        <TabCanvas ref={canvasRef} />
      </div>
      <TabProperties
        metadata={metadata}
        collapsed={propertiesCollapsed}
        onToggleCollapse={toggleProperties}
        filePath={filePath}
        documents={documents}
        backlinks={backlinks}
        readOnly={readOnly}
        onPreviewDocument={onPreviewDocument}
        onOpenDocPicker={onAttachDocument ? (type, id) => setPickerTarget({ type, id }) : undefined}
        onDetachDocument={onDetachDocument}
      />
      {pickerTarget && onAttachDocument && (
        <DocumentPicker
          allDocPaths={allDocPaths ?? []}
          attachedPaths={
            getDocumentsForEntity
              ? getDocumentsForEntity(pickerTarget.type, pickerTarget.id).map((d) => d.filename)
              : []
          }
          onAttach={(path) => {
            onAttachDocument(path, pickerTarget.type, pickerTarget.id);
          }}
          onCreate={async (path) => {
            if (rootHandle && onCreateDocument) {
              await onCreateDocument(rootHandle, path);
              onAttachDocument(path, pickerTarget.type, pickerTarget.id);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
