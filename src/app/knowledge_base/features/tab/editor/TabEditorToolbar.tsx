"use client";
import type { ReactElement } from "react";
import type { NoteDuration, Technique } from "../../../domain/tabEngine";
import { DurationButtons } from "./components/DurationButtons";
import { TechniqueButtons } from "./components/TechniqueButtons";
import { HistoryButtons } from "./components/HistoryButtons";

export interface TabEditorToolbarProps {
  activeDuration: NoteDuration;
  onSetDuration: (duration: NoteDuration) => void;

  activeTechniques: Set<Technique>;
  onToggleTechnique: (technique: Technique) => void;

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
