"use client";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { ReactElement } from "react";
import type { TabSession, TabEditOp, TabMetadata, NoteDuration, Technique } from "../../../domain/tabEngine";
import type { CursorLocation } from "./hooks/useTabCursor";
import { useTabKeyboard } from "./hooks/useTabKeyboard";
import { useTabEditHistory } from "../hooks/useTabEditHistory";
import { TabEditorToolbar } from "./TabEditorToolbar";
import { TabEditorCanvasOverlay } from "./TabEditorCanvasOverlay";
import type { PreState } from "../editHistory/inverseOf";
import { findBeat, findNote, findBarByBeat } from "./scoreNavigation";
import { midiToScientificPitch } from "../../../infrastructure/alphaTabEngine";

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

  // C3: cursor state lifted to TabView so TabProperties can observe it.
  /** Current cursor location — provided by TabView (via useTabCursor). */
  cursor: CursorLocation | null;
  setCursor: (loc: CursorLocation) => void;
  clearCursor: () => void;
  moveBeat: (delta: 1 | -1) => void;
  moveString: (delta: 1 | -1) => void;
  moveBar: (delta: 1 | -1) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  /**
   * Called after each successful apply (fire-and-forget). Used by TabView
   * to trigger sidecar writes after section-affecting edits (C2).
   */
  onApplyEdit?: (op: TabEditOp) => void;
  /**
   * C3: Called once after useTabEditHistory is set up, with the `apply` fn.
   * TabView stores this in a ref so TabProperties can dispatch ops with full
   * undo-history support.
   */
  registerApply?: (applyFn: (op: TabEditOp) => void) => void;
}

export default function TabEditor({
  filePath: _filePath,
  session,
  score,
  metadata,
  onScoreChange,
  cursor,
  setCursor,
  clearCursor,
  moveBeat,
  moveString,
  moveBar,
  nextTrack,
  prevTrack,
  onApplyEdit,
  registerApply,
}: TabEditorProps): ReactElement {
  const [activeDuration, setActiveDuration] = useState<NoteDuration>(4);
  const activeDurationRef = useRef<NoteDuration>(4);
  activeDurationRef.current = activeDuration;

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
      case "add-track": {
        const count = (s?.tracks?.length ?? 0) as number;
        return { trackCount: count } as PreState;
      }
      case "remove-track": {
        const idx = Number(op.trackId);
        const track = s?.tracks?.[idx];
        if (!track) {
          return { removedTrack: { name: "Unknown", instrument: "guitar", tuning: [], capo: 0 } } as PreState;
        }
        const tuningMidi: number[] = (track.staves?.[0]?.tuning as number[] | undefined) ?? [];
        const tuning = tuningMidi.map(midiToScientificPitch);
        const capo = (track.staves?.[0]?.capo as number | undefined) ?? 0;
        const stringCount = tuningMidi.length;
        const instrument: "guitar" | "bass" = stringCount > 0 && stringCount <= 4 ? "bass" : "guitar";
        const name = (track.name as string | undefined) ?? `Track ${idx + 1}`;
        return { removedTrack: { name, instrument, tuning, capo } } as PreState;
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

  // Forward apply to parent so it can pass it to TabProperties.
  const applyAndNotify = useCallback((op: TabEditOp): void => {
    apply(op);
    onApplyEdit?.(op);
  }, [apply, onApplyEdit]);

  // C3: Register apply with TabView so TabProperties can dispatch with undo history.
  useEffect(() => {
    registerApply?.(applyAndNotify);
  }, [registerApply, applyAndNotify]);

  useTabKeyboard({
    cursor,
    setCursor,
    clearCursor,
    moveBeat,
    moveString,
    moveBar,
    nextTrack,
    prevTrack,
    apply: applyAndNotify,
    undo,
    redo,
    activeDurationRef,
    enabled: true,
  });

  // activeTechniques used by toolbar buttons — read from score at current cursor.
  const activeTechniques = useMemo((): Set<Technique> => {
    if (!score || !cursor) return new Set<Technique>();
    const s = score as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const beat = findBeat(s, cursor.beat);
    const note = beat?.notes?.find((n: any) => n.string === cursor.string); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!note) return new Set<Technique>();
    const techniques = new Set<Technique>();
    if (note.isHammerPullOrigin === true) techniques.add("hammer-on");
    if (note.bendType !== undefined && note.bendType !== 0) techniques.add("bend");
    if (note.slideOutType !== undefined && note.slideOutType !== 0) techniques.add("slide");
    if (note.isTieDestination === true) techniques.add("tie");
    if (note.isGhost === true) techniques.add("ghost");
    if (note.vibrato !== undefined && note.vibrato !== 0) techniques.add("vibrato");
    if (note.isLetRing === true) techniques.add("let-ring");
    if (note.isPalmMute === true) techniques.add("palm-mute");
    if (note.harmonicType !== undefined && note.harmonicType !== 0) techniques.add("harmonic");
    if (note.beat?.tap === true) techniques.add("tap");
    if (note.beat?.tremoloSpeed != null) techniques.add("tremolo");
    return techniques;
  }, [score, cursor]);

  const handleSetDuration = useCallback((d: NoteDuration) => {
    setActiveDuration(d);
    if (cursor) applyAndNotify({ type: "set-duration", beat: cursor.beat, duration: d });
  }, [cursor, applyAndNotify]);

  const handleToggleTechnique = useCallback((technique: Technique) => {
    if (!cursor) return;
    const op: TabEditOp = activeTechniques.has(technique)
      ? { type: "remove-technique", beat: cursor.beat, string: cursor.string, technique }
      : { type: "add-technique",    beat: cursor.beat, string: cursor.string, technique };
    applyAndNotify(op);
  }, [cursor, activeTechniques, applyAndNotify]);

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
