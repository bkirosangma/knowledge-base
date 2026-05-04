"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Paperclip } from "lucide-react";
import type { TabEditOp, TabMetadata } from "../../../domain/tabEngine";
import type { DocumentMeta } from "../../document/types";
import { TabReferencesList } from "./TabReferencesList";
import type { SelectedNoteDetails as SelectedNoteDetailsType } from "../editor/hooks/useSelectedNoteDetails";
import { SelectedNoteDetails } from "./SelectedNoteDetails";
import { useRepositories } from "../../../shell/RepositoryContext";
import { resolveSectionIds } from "../../../domain/tabSectionIds";
import type { TabRefsPayload } from "../../../domain/tabRefs";

export interface TabPropertiesProps {
  metadata: TabMetadata | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  filePath?: string;
  documents?: DocumentMeta[];
  backlinks?: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreviewDocument?: (path: string) => void;
  onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  /** Selected note details to render in the "Selected note" subsection. */
  selectedNoteDetails?: SelectedNoteDetailsType | null;
  /** Global beat index of the current cursor position. Required when selectedNoteDetails is set. */
  cursorBeat?: number;
  /** String index of the current cursor position. Required when selectedNoteDetails is set. */
  cursorString?: number;
  /** Callback to dispatch tab edit operations from the properties panel. */
  onApplyEdit?: (op: TabEditOp) => void;
  /**
   * Zero-based index of the active track. Defaults to 0.
   * T26 will wire this to the actual cursor-driven value.
   */
  activeTrackIndex?: number;
  /**
   * Callback fired when a track row is clicked or activated via Enter/Space.
   * Optional; T26 will wire the actual handler. If undefined, row clicks are no-ops.
   */
  onSwitchActiveTrack?: (i: number) => void;
  /** IDs of muted tracks. Defaults to []. T26 will wire the actual state. */
  mutedTrackIds?: string[];
  /** IDs of soloed tracks. Defaults to []. T26 will wire the actual state. */
  soloedTrackIds?: string[];
  /** Callback fired when a mute button is clicked. T26 will wire the actual handler. */
  onToggleMute?: (trackId: string) => void;
  /** Callback fired when a solo button is clicked. T26 will wire the actual handler. */
  onToggleSolo?: (trackId: string) => void;
}

/**
 * Side panel for an open tab. Surfaces metadata from
 * `useTabEngine().metadata` and (TAB-007a) cross-references: a
 * "Whole-file references" group plus per-section "References" sub-lists,
 * each merging explicit attachments with wiki-link backlinks.
 */
export function TabProperties(props: TabPropertiesProps): ReactElement {
  const {
    metadata, collapsed, onToggleCollapse,
    filePath, documents, backlinks, readOnly,
    onPreviewDocument, onOpenDocPicker, onDetachDocument,
    selectedNoteDetails, cursorBeat, cursorString, onApplyEdit,
    activeTrackIndex = 0,
    onSwitchActiveTrack,
    mutedTrackIds = [],
    soloedTrackIds = [],
    onToggleMute,
    onToggleSolo,
  } = props;
  const widthClass = collapsed ? "w-9" : "w-72";
  return (
    <aside
      data-testid="tab-properties"
      data-collapsed={collapsed ? "true" : "false"}
      className={`flex h-full flex-col border-l border-line bg-surface text-sm transition-[width] duration-200 ${widthClass}`}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        {!collapsed && <span className="text-xs font-medium text-mute">Properties</span>}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand properties" : "Collapse properties"}
          className="rounded px-1 hover:bg-line/20"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-4">
          {metadata === null ? (
            <p className="text-mute">Loading score…</p>
          ) : (
            <>
              <Header metadata={metadata} />
              <General metadata={metadata} activeTrackIndex={activeTrackIndex} />
              <Tuning metadata={metadata} activeTrackIndex={activeTrackIndex} />
              <Tracks
                metadata={metadata}
                activeTrackIndex={activeTrackIndex}
                onSwitchActiveTrack={onSwitchActiveTrack}
                mutedTrackIds={mutedTrackIds}
                soloedTrackIds={soloedTrackIds}
                onToggleMute={onToggleMute}
                onToggleSolo={onToggleSolo}
              />
              {selectedNoteDetails != null && !readOnly && onApplyEdit !== undefined && (
                <SelectedNoteDetails
                  details={selectedNoteDetails}
                  cursorBeat={cursorBeat ?? 0}
                  cursorString={cursorString ?? 1}
                  onApply={onApplyEdit}
                />
              )}
              <Sections
                metadata={metadata}
                filePath={filePath}
                documents={documents}
                backlinks={backlinks}
                readOnly={readOnly}
                onPreviewDocument={onPreviewDocument}
                onOpenDocPicker={onOpenDocPicker}
                onDetachDocument={onDetachDocument}
              />
              {filePath && (
                <FileReferences
                  filePath={filePath}
                  documents={documents}
                  backlinks={backlinks}
                  readOnly={readOnly}
                  onPreviewDocument={onPreviewDocument}
                  onOpenDocPicker={onOpenDocPicker}
                  onDetachDocument={onDetachDocument}
                />
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Header({ metadata }: { metadata: TabMetadata }): ReactElement {
  return (
    <section>
      <h2 className="text-base font-semibold">{metadata.title}</h2>
      {metadata.artist && <p className="text-mute">{metadata.artist}</p>}
      {metadata.subtitle && <p className="text-xs text-mute">{metadata.subtitle}</p>}
    </section>
  );
}

function General({ metadata, activeTrackIndex }: { metadata: TabMetadata; activeTrackIndex: number }): ReactElement {
  const ts = `${metadata.timeSignature.numerator}/${metadata.timeSignature.denominator}`;
  const capo = metadata.tracks[activeTrackIndex]?.capo ?? 0;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">General</h3>
      <dl className="space-y-1">
        <Row label="Tempo">{`${metadata.tempo} BPM`}</Row>
        {metadata.key && <Row label="Key">{metadata.key}</Row>}
        <Row label="Time">{ts}</Row>
        <Row label="Capo">{`Capo ${capo}`}</Row>
      </dl>
    </section>
  );
}

function Tuning({ metadata, activeTrackIndex }: { metadata: TabMetadata; activeTrackIndex: number }): ReactElement | null {
  const tuning = metadata.tracks[activeTrackIndex]?.tuning ?? [];
  if (tuning.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Tuning</h3>
      <p className="font-mono text-xs">{tuning.join(" ")}</p>
    </section>
  );
}

function Tracks({
  metadata,
  activeTrackIndex,
  onSwitchActiveTrack,
  mutedTrackIds,
  soloedTrackIds,
  onToggleMute,
  onToggleSolo,
}: {
  metadata: TabMetadata;
  activeTrackIndex: number;
  onSwitchActiveTrack?: (i: number) => void;
  mutedTrackIds: string[];
  soloedTrackIds: string[];
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
}): ReactElement | null {
  if (metadata.tracks.length === 0) return null;
  const handleSwitch = (i: number): void => {
    if (onSwitchActiveTrack) onSwitchActiveTrack(i);
  };
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Tracks ({metadata.tracks.length})
      </h3>
      <ul className="space-y-1">
        {metadata.tracks.map((track, i) => {
          const active = i === activeTrackIndex;
          const isMuted = mutedTrackIds.includes(track.id);
          const isSoloed = soloedTrackIds.includes(track.id);
          return (
            <li
              key={track.id}
              data-track-row
              className={`rounded border border-line/50 px-2 py-1 cursor-pointer border-l-2 focus-visible:ring-2 focus-visible:ring-accent ${
                active
                  ? "border-l-accent bg-accent/5 font-semibold"
                  : "border-l-transparent text-mute"
              }`}
              tabIndex={0}
              onClick={() => handleSwitch(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSwitch(i);
                }
              }}
            >
              <span className="flex items-center">
                <span
                  data-active-dot
                  data-filled={active}
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                    active ? "bg-accent" : "border border-mute"
                  }`}
                />
                <span className="flex-1">{track.name}</span>
                <span className="inline-flex gap-1 items-center">
                  <button
                    type="button"
                    aria-label={`Mute ${track.name}`}
                    aria-pressed={isMuted}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMute?.(track.id);
                    }}
                    className={`w-5 h-5 rounded text-xs font-bold cursor-pointer focus-visible:ring-2 focus-visible:ring-accent ${
                      isMuted
                        ? "bg-warn/30 text-warn"
                        : "text-mute hover:text-ink"
                    }`}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    aria-label={`Solo ${track.name}`}
                    aria-pressed={isSoloed}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo?.(track.id);
                    }}
                    className={`w-5 h-5 rounded text-xs font-bold cursor-pointer focus-visible:ring-2 focus-visible:ring-accent ${
                      isSoloed
                        ? "bg-accent/30 text-accent"
                        : "text-mute hover:text-ink"
                    }`}
                  >
                    S
                  </button>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sections({
  metadata, filePath, documents, backlinks, readOnly,
  onPreviewDocument, onOpenDocPicker, onDetachDocument,
}: {
  metadata: TabMetadata;
  filePath?: string;
  documents?: DocumentMeta[];
  backlinks?: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreviewDocument?: (path: string) => void;
  onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
}): ReactElement | null {
  // C2: Read the sidecar to resolve stable section IDs.
  const { tabRefs } = useRepositories();
  const [sidecar, setSidecar] = useState<TabRefsPayload | null>(null);
  useEffect(() => {
    if (!tabRefs || !filePath) { setSidecar(null); return; }
    let cancelled = false;
    tabRefs.read(filePath).then((payload) => {
      if (!cancelled) setSidecar(payload);
    }).catch(() => { if (!cancelled) setSidecar(null); });
    return () => { cancelled = true; };
  }, [tabRefs, filePath]);

  const ids = useMemo(
    () => resolveSectionIds(metadata.sections, sidecar),
    [metadata.sections, sidecar],
  );

  if (metadata.sections.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Sections ({metadata.sections.length})
      </h3>
      <ul className="space-y-2">
        {metadata.sections.map((section, i) => {
          const id = ids[i];
          const entityId = filePath ? `${filePath}#${id}` : "";
          const sectionAttachments = (documents ?? []).filter((d) =>
            d.attachedTo?.some((a) => a.type === "tab-section" && a.id === entityId),
          );
          const sectionBacklinks = (backlinks ?? []).filter((bl) => bl.section === id);
          return (
            <li
              key={id}
              data-testid={`tab-section-row-${id}`}
              className="rounded border border-line/50 px-2 py-1 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span>{section.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mute">beat {section.startBeat}</span>
                  {!readOnly && filePath && onOpenDocPicker && (
                    <button
                      type="button"
                      data-testid={`attach-section-${id}`}
                      aria-label={`Attach to ${section.name}`}
                      onClick={() => onOpenDocPicker("tab-section", entityId)}
                      className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
                    >
                      <Paperclip size={12} />
                    </button>
                  )}
                </div>
              </div>
              {filePath && (sectionAttachments.length > 0 || sectionBacklinks.length > 0) && (
                <TabReferencesList
                  attachments={sectionAttachments}
                  backlinks={sectionBacklinks}
                  readOnly={readOnly}
                  onPreview={onPreviewDocument}
                  onDetach={
                    onDetachDocument
                      ? (docPath) => onDetachDocument(docPath, "tab-section", entityId)
                      : undefined
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FileReferences({
  filePath, documents, backlinks, readOnly,
  onPreviewDocument, onOpenDocPicker, onDetachDocument,
}: {
  filePath: string;
  documents?: DocumentMeta[];
  backlinks?: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreviewDocument?: (path: string) => void;
  onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
}): ReactElement {
  const fileAttachments = (documents ?? []).filter((d) =>
    d.attachedTo?.some((a) => a.type === "tab" && a.id === filePath),
  );
  const fileBacklinks = (backlinks ?? []).filter((bl) => !bl.section);
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase text-mute">Whole-file references</h3>
        {!readOnly && onOpenDocPicker && (
          <button
            type="button"
            data-testid="attach-file"
            aria-label="Attach to file"
            onClick={() => onOpenDocPicker("tab", filePath)}
            className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
          >
            <Paperclip size={12} />
          </button>
        )}
      </div>
      <TabReferencesList
        attachments={fileAttachments}
        backlinks={fileBacklinks}
        readOnly={readOnly}
        onPreview={onPreviewDocument}
        onDetach={
          onDetachDocument
            ? (docPath) => onDetachDocument(docPath, "tab", filePath)
            : undefined
        }
      />
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
}
