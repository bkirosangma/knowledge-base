"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useObservedTheme } from "../../shared/hooks/useObservedTheme";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { TabCanvas } from "./components/TabCanvas";
import { TabToolbar } from "./components/TabToolbar";
import { useTabContent } from "./hooks/useTabContent";
import { useTabEngine } from "./hooks/useTabEngine";
import { useTabPlayback } from "./hooks/useTabPlayback";
import { useTabEditMode } from "./hooks/useTabEditMode";
import { TabProperties } from "./properties/TabProperties";
import type { DocumentMeta } from "../document/types";
import { useTabSectionSync } from "./properties/useTabSectionSync";
import DocumentPicker from "../../shared/components/DocumentPicker";
import { PROPERTIES_COLLAPSED_KEY } from "../../shared/constants/paneStorage";
import { useTabCursor } from "./editor/hooks/useTabCursor";
import { useSelectedNoteDetails } from "./editor/hooks/useSelectedNoteDetails";
import type { TabEditOp, TabMetadata } from "../../domain/tabEngine";
import type { CursorLocation } from "./editor/hooks/useTabCursor";
import { useRepositories } from "../../shell/RepositoryContext";
import { emptyTabRefs } from "../../domain/tabRefs";
import {
  updateSidecarOnEdit as updateSidecarPayload,
  type UpdateSidecarContext,
} from "./sidecarReconcile";

const LazyTabEditor = dynamic(() => import("./editor/TabEditor"), { ssr: false });

// Kept as a type alias so the lazy-loaded module is the single canonical import.
type TabEditorPassthroughProps = {
  filePath: string;
  session: unknown;
  score: unknown;
  metadata: unknown;
  onScoreChange?: (score: unknown) => void;
  cursor: CursorLocation | null;
  setCursor: (loc: CursorLocation) => void;
  clearCursor: () => void;
  moveBeat: (delta: 1 | -1) => void;
  moveString: (delta: 1 | -1) => void;
  moveBar: (delta: 1 | -1) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  onApplyEdit?: (op: TabEditOp) => void;
  registerApply?: (applyFn: (op: TabEditOp) => void) => void;
};
// Cast the dynamic component to accept the full prop shape (Next's dynamic types are widened).
const TypedLazyTabEditor = LazyTabEditor as unknown as React.ComponentType<TabEditorPassthroughProps>;

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
  const { effectiveReadOnly, perFileReadOnly, toggleReadOnly } = useTabEditMode(filePath ?? null, readOnly ?? false);
  const { content, loadError, score: tabScore, setScore: setTabScore } = useTabContent(filePath);
  const {
    status,
    error: engineError,
    mountInto,
    metadata,
    currentTick,
    playerStatus,
    isAudioReady,
    session,
    score: engineScore,
  } = useTabEngine();
  // C3: cursor and selected-note-details lifted to TabView so TabProperties can observe them.
  const { cursor, setCursor, clear: clearCursor, moveBeat, moveString, moveBar, nextTrack, prevTrack } = useTabCursor(metadata);
  const liveScore = tabScore ?? engineScore;
  const selectedNoteDetails = useSelectedNoteDetails(liveScore, cursor);
  // C3: stable proxy for TabEditor's apply fn, written by TabEditor via registerApply.
  // This lets TabProperties call apply (with undo history) without a direct dependency.
  const editorApplyRef = useRef<((op: TabEditOp) => void) | null>(null);
  const propertiesApply = useCallback((op: TabEditOp): void => {
    editorApplyRef.current?.(op);
  }, []);

  // C2: sidecar write — hold refs to avoid stale closures in the async callback.
  const { tabRefs } = useRepositories();
  const metadataRef = useRef<TabMetadata | null>(null);
  metadataRef.current = metadata;
  const filePathRef = useRef<string>(filePath);
  filePathRef.current = filePath;

  const updateSidecarOnEdit = useCallback(async (op: TabEditOp): Promise<void> => {
    if (!tabRefs) return;
    // Ops that don't touch the sidecar — short-circuit.
    if (
      op.type !== "set-section" &&
      op.type !== "add-bar" &&
      op.type !== "remove-bar" &&
      op.type !== "add-track" &&
      op.type !== "remove-track"
    ) return;
    // remove-track needs pre-edit position capture which T10 doesn't wire.
    if (op.type === "remove-track") return; // TODO(T26): capture removedPosition pre-edit
    const fp = filePathRef.current;
    const md = metadataRef.current;
    if (!fp) return;
    // add-bar / remove-bar need the current section list; set-section / add-track do not
    // (metadata may still be null on the very first edit before the engine fires "loaded").
    if ((op.type === "add-bar" || op.type === "remove-bar") && !md) return;

    const prev = (await tabRefs.read(fp)) ?? emptyTabRefs();

    let ctx: UpdateSidecarContext = {};
    if (op.type === "set-section") {
      // Op-aware rename: find the old name from metadata BEFORE the engine updates.
      // metadata still reflects the pre-edit state at this point (engine fires "loaded"
      // asynchronously after applyEdit). We find the section at op.beat.
      const oldSection = md?.sections.find((s) => s.startBeat === op.beat);
      ctx = { oldSectionName: oldSection?.name ?? null };
    } else if (op.type === "add-bar" || op.type === "remove-bar") {
      // md is guaranteed non-null here (guard above).
      ctx = { currentSections: md!.sections };
    } else if (op.type === "add-track") {
      ctx = { newTrackId: crypto.randomUUID() };
    }

    const next = updateSidecarPayload(prev, op, ctx);
    await tabRefs.write(fp, next);
  }, [tabRefs]);
  const playback = useTabPlayback({ session, isAudioReady, playerStatus, currentTick });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PROPERTIES_COLLAPSED_KEY) === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(PROPERTIES_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
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
          paneReadOnly={readOnly ?? false}
          perFileReadOnly={perFileReadOnly}
          onToggleReadOnly={toggleReadOnly}
        />
        {status === "mounting" && (
          <div
            data-testid="tab-view-loading"
            className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-mute"
          >
            Loading score…
          </div>
        )}
        <TabCanvas ref={canvasRef} />
        {!effectiveReadOnly && filePath && (
          <TypedLazyTabEditor
            filePath={filePath}
            session={session}
            score={liveScore}
            metadata={metadata}
            onScoreChange={setTabScore}
            cursor={cursor}
            setCursor={setCursor}
            clearCursor={clearCursor}
            moveBeat={moveBeat}
            moveString={moveString}
            moveBar={moveBar}
            nextTrack={nextTrack}
            prevTrack={prevTrack}
            registerApply={(fn) => { editorApplyRef.current = fn; }}
            onApplyEdit={(op) => { void updateSidecarOnEdit(op); }}
          />
        )}
      </div>
      <TabProperties
        metadata={metadata}
        collapsed={propertiesCollapsed}
        onToggleCollapse={toggleProperties}
        filePath={filePath}
        documents={documents}
        backlinks={backlinks}
        readOnly={effectiveReadOnly}
        onPreviewDocument={onPreviewDocument}
        onOpenDocPicker={onAttachDocument ? (type, id) => setPickerTarget({ type, id }) : undefined}
        onDetachDocument={onDetachDocument}
        selectedNoteDetails={selectedNoteDetails}
        cursorBeat={cursor?.beat}
        cursorString={cursor?.string}
        onApplyEdit={propertiesApply}
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
          onCreate={
            rootHandle && onCreateDocument
              ? async (path) => {
                  await onCreateDocument(rootHandle, path);
                  onAttachDocument(path, pickerTarget.type, pickerTarget.id);
                }
              : undefined
          }
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

