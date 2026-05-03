"use client";
import { useCallback, useRef, useState, useMemo } from "react";
import type { ReactElement } from "react";
import type { TabSession, TabEditOp, TabMetadata, NoteDuration, Technique } from "../../../domain/tabEngine";
import { useTabCursor } from "./hooks/useTabCursor";
import { useTabKeyboard } from "./hooks/useTabKeyboard";
import { useTabEditHistory } from "../hooks/useTabEditHistory";
import { useSelectedNoteDetails } from "./hooks/useSelectedNoteDetails";
import { TabEditorToolbar } from "./TabEditorToolbar";
import { TabEditorCanvasOverlay } from "./TabEditorCanvasOverlay";
import type { PreState } from "../editHistory/inverseOf";
import { findBeat, findNote, findBarByBeat } from "./scoreNavigation";

export interface TabEditorProps {
  filePath: string;
  session: TabSession | null;
  score: unknown | null;
  metadata: TabMetadata | null;
  /**
   * Called after each successful applyEdit so the parent (TabView via
   * useTabContent.setScore) can schedule a debounced file flush.
   *
   * NOTE: alphaTab mutates its score in place, so the session.score reference
   * is the same object before and after the edit. We pass `session.score` here
   * (not the stale `score` prop) to ensure the post-edit state is captured.
   */
  onScoreChange?: (score: unknown) => void;
}

export default function TabEditor({
  filePath: _filePath,
  session,
  score,
  metadata,
  onScoreChange,
}: TabEditorProps): ReactElement {
  const [activeDuration, setActiveDuration] = useState<NoteDuration>(4);
  const activeDurationRef = useRef<NoteDuration>(4);
  activeDurationRef.current = activeDuration;

  const cursorState = useTabCursor(metadata);
  const { cursor, setCursor, clear: clearCursor, moveBeat, moveString, moveBar } = cursorState;

  /**
   * captureState — read pre-state for inverse-op generation.
   *
   * Walks the live score object to capture the real value BEFORE the mutation
   * so that undo restores the actual prior state (not a hardcoded sentinel).
   */
  const captureState = useCallback((op: TabEditOp): PreState => {
    // Score is typed as unknown; helpers in scoreNavigation.ts use `any` internally.
    const s = score as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (op.type) {
      case "set-fret": {
        const note = s ? findNote(s, op.beat, op.string) : null;
        return { fret: note ? (note.fret as number) : null } as PreState;
      }
      case "set-duration": {
        const beat = s ? findBeat(s, op.beat) : null;
        return { duration: beat ? (beat.duration as number) : 4 } as PreState;
      }
      case "set-tempo": {
        const bar = s ? findBarByBeat(s, op.beat) : null;
        const auto = bar?.tempoAutomations?.[0];
        return { bpm: auto ? (auto.value as number) : 120 } as PreState;
      }
      case "set-section": {
        const bar = s ? findBarByBeat(s, op.beat) : null;
        return { name: bar?.section?.text ?? null } as PreState;
      }
      case "set-track-tuning": {
        const track = s?.tracks?.[parseInt(op.trackId, 10)];
        return { tuning: track?.staves?.[0]?.tuning?.slice() ?? [] } as PreState;
      }
      case "set-track-capo": {
        const track = s?.tracks?.[parseInt(op.trackId, 10)];
        return { fret: track?.staves?.[0]?.capo ?? 0 } as PreState;
      }
      default:
        return {} as PreState;
    }
  }, [score]);

  const dispatch = useCallback((op: TabEditOp): void => {
    if (!session) return;
    try {
      session.applyEdit?.(op);
      // Read from session.score (not the stale `score` prop): alphaTab mutates
      // the score object in place, so session.score always reflects post-edit state.
      onScoreChange?.(session.score ?? score);
    } catch {
      // Engine errors surface via shellErrors banner already wired in TabView.
    }
  }, [session, score, onScoreChange]);

  const history = useTabEditHistory({ dispatch, captureState });
  const { apply, undo, redo, canUndo, canRedo } = history;

  useTabKeyboard({
    cursor,
    setCursor,
    clearCursor,
    moveBeat,
    moveString,
    moveBar,
    apply,
    undo,
    redo,
    activeDurationRef,
    enabled: true,
  });

  const selectedNote = useSelectedNoteDetails(score, cursor);
  const activeTechniques = useMemo(
    () => selectedNote?.techniques ?? new Set<Technique>(),
    [selectedNote],
  );

  const handleSetDuration = useCallback((d: NoteDuration) => {
    setActiveDuration(d);
    if (cursor) apply({ type: "set-duration", beat: cursor.beat, duration: d });
  }, [cursor, apply]);

  const handleToggleTechnique = useCallback((technique: Technique) => {
    if (!cursor) return;
    const op: TabEditOp = activeTechniques.has(technique)
      ? { type: "remove-technique", beat: cursor.beat, string: cursor.string, technique }
      : { type: "add-technique",    beat: cursor.beat, string: cursor.string, technique };
    apply(op);
  }, [cursor, activeTechniques, apply]);

  return (
    <div data-testid="tab-editor" className="absolute inset-0 pointer-events-none flex flex-col">
      <div className="pointer-events-auto bg-surface">
        <TabEditorToolbar
          activeDuration={activeDuration}
          onSetDuration={handleSetDuration}
          activeTechniques={activeTechniques}
          onToggleTechnique={handleToggleTechnique}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      </div>
      <div className="relative flex-1">
        <TabEditorCanvasOverlay
          metadata={metadata}
          cursor={cursor}
          setCursor={setCursor}
        />
      </div>
    </div>
  );
}
