"use client";

import type { ReactElement } from "react";
import type { TabMetadata } from "../../../domain/tabEngine";

export interface TabPropertiesProps {
  metadata: TabMetadata | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Read-only side panel for an open tab — surfaces the metadata
 * `useTabEngine().metadata` already emits via the engine's "loaded"
 * event. No editing in TAB-007. Attachments + section-level docs land
 * in TAB-007a (`DocumentsSection` reuse + wiki-link backlinks).
 *
 * Layout: 280px expanded, 36px collapsed (icon-only chrome). Always
 * mounted so the slide transition animates instead of unmounting.
 */
export function TabProperties(props: TabPropertiesProps): ReactElement {
  const { metadata, collapsed, onToggleCollapse } = props;
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
              <General metadata={metadata} />
              <Tuning metadata={metadata} />
              <Tracks metadata={metadata} />
              <Sections metadata={metadata} />
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

function General({ metadata }: { metadata: TabMetadata }): ReactElement {
  const ts = `${metadata.timeSignature.numerator}/${metadata.timeSignature.denominator}`;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">General</h3>
      <dl className="space-y-1">
        <Row label="Tempo">{`${metadata.tempo} BPM`}</Row>
        {metadata.key && <Row label="Key">{metadata.key}</Row>}
        <Row label="Time">{ts}</Row>
        <Row label="Capo">{`Capo ${metadata.capo}`}</Row>
      </dl>
    </section>
  );
}

function Tuning({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.tuning.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Tuning</h3>
      <p className="font-mono text-xs">{metadata.tuning.join(" ")}</p>
    </section>
  );
}

function Tracks({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.tracks.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Tracks ({metadata.tracks.length})
      </h3>
      <ul className="space-y-1">
        {metadata.tracks.map((track) => (
          <li key={track.id} className="rounded border border-line/50 px-2 py-1">
            <span>{track.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sections({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.sections.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Sections ({metadata.sections.length})
      </h3>
      <ul className="space-y-1">
        {metadata.sections.map((section) => (
          <li key={section.name} className="flex items-center justify-between rounded border border-line/50 px-2 py-1">
            <span>{section.name}</span>
            <span className="text-xs text-mute">beat {section.startBeat}</span>
          </li>
        ))}
      </ul>
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
