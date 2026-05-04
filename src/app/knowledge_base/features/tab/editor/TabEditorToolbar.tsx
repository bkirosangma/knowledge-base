"use client";
import type { ReactElement } from "react";
import type { NoteDuration, Technique } from "../../../domain/tabEngine";
import { DurationButtons } from "./components/DurationButtons";
import { TechniqueButtons } from "./components/TechniqueButtons";
import { HistoryButtons } from "./components/HistoryButtons";
import { VoiceToggle } from "./components/VoiceToggle";

export interface TabEditorToolbarProps {
  activeDuration: NoteDuration;
  onSetDuration: (duration: NoteDuration) => void;

  activeTechniques: Set<Technique>;
  onToggleTechnique: (technique: Technique) => void;

  voiceIndex: 0 | 1;
  onVoiceChange: (v: 0 | 1) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  className?: string;
}

export function TabEditorToolbar(props: TabEditorToolbarProps): ReactElement {
  return (
    <div
      data-testid="tab-editor-toolbar"
      className={`flex items-center gap-2 px-2 py-1 border-b border-line bg-surface text-sm${props.className ? ` ${props.className}` : ""}`}
    >
      <DurationButtons active={props.activeDuration} onSelect={props.onSetDuration} />
      <div className="w-px h-5 bg-line" aria-hidden="true" />
      {/*
       * V1/V2 toggle drives cursor.voiceIndex; new beat ops land in the active voice.
       * Assumption: alphaTab auto-renders both voices when voices[1] has content
       * (Bar.isMultiVoice / filledVoices APIs suggest this; .d.ts has no explicit
       * render flag). Verify with a real two-voice fixture in dev once T26 wires
       * the full TabView; if voices[1] does not appear, an alphaTab settings
       * toggle (or a custom render hint) may be needed.
       */}
      <VoiceToggle voiceIndex={props.voiceIndex} onChange={props.onVoiceChange} />
      <div className="w-px h-5 bg-line" aria-hidden="true" />
      <TechniqueButtons active={props.activeTechniques} onToggle={props.onToggleTechnique} />
      <div className="w-px h-5 bg-line" aria-hidden="true" />
      <HistoryButtons
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
      />
    </div>
  );
}
