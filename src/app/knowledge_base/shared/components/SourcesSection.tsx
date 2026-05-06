"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { isValidSourceUrl, sourceDisplayLabel, type SourceLink } from "../types/sources";

interface Props {
  sources: SourceLink[];
  onChange: (next: SourceLink[]) => void;
  readOnly?: boolean;
}

export function SourcesSection({ sources, onChange, readOnly = false }: Props) {
  const [errors, setErrors] = useState<Record<number, string>>({});

  const clearError = (i: number) =>
    setErrors((prev) => {
      if (!(i in prev)) return prev;
      const { [i]: _drop, ...rest } = prev;
      return rest;
    });

  const setError = (i: number, msg: string) =>
    setErrors((prev) => ({ ...prev, [i]: msg }));

  const handleAdd = () => onChange([...sources, { url: "", title: "" }]);

  const handleTitleChange = (i: number, title: string) => {
    onChange(sources.map((s, idx) => (idx === i ? { ...s, title } : s)));
  };

  const handleUrlBlur = (i: number, draft: string): "committed" | "invalid" | "noop" => {
    const trimmed = draft.trim();
    const current = sources[i]?.url ?? "";
    if (trimmed === current) {
      clearError(i);
      return "noop";
    }
    if (trimmed === "") {
      clearError(i);
      onChange(sources.map((s, idx) => (idx === i ? { ...s, url: "" } : s)));
      return "committed";
    }
    if (!isValidSourceUrl(trimmed)) {
      setError(i, "Enter a valid http(s) URL.");
      return "invalid";
    }
    clearError(i);
    onChange(sources.map((s, idx) => (idx === i ? { ...s, url: trimmed } : s)));
    return "committed";
  };

  const handleRemove = (i: number) => {
    clearError(i);
    onChange(sources.filter((_, idx) => idx !== i));
  };

  if (sources.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-mute italic">
          {readOnly ? "No sources recorded." : "No sources recorded — add one below."}
        </p>
        {!readOnly && (
          <button
            type="button"
            data-testid="sources-add"
            onClick={handleAdd}
            className="self-start text-xs text-accent hover:underline"
          >
            + Add source
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sources.map((s, i) => (
        <SourceRow
          key={i}
          index={i}
          source={s}
          error={errors[i]}
          readOnly={readOnly}
          onTitleChange={(title) => handleTitleChange(i, title)}
          onUrlBlur={(draft) => handleUrlBlur(i, draft)}
          onRemove={() => handleRemove(i)}
        />
      ))}
      {!readOnly && (
        <button
          type="button"
          data-testid="sources-add"
          onClick={handleAdd}
          className="self-start text-xs text-accent hover:underline"
        >
          + Add source
        </button>
      )}
    </div>
  );
}

interface RowProps {
  index: number;
  source: SourceLink;
  error?: string;
  readOnly: boolean;
  onTitleChange: (title: string) => void;
  onUrlBlur: (draft: string) => "committed" | "invalid" | "noop";
  onRemove: () => void;
}

function SourceRow({ index, source, error, readOnly, onTitleChange, onUrlBlur, onRemove }: RowProps) {
  const [urlDraft, setUrlDraft] = useState(source.url);

  // Sync draft with the canonical URL when the parent updates it (e.g. after commit elsewhere).
  useEffect(() => {
    setUrlDraft(source.url);
  }, [source.url]);

  const label = sourceDisplayLabel(source);
  const hasUrl = source.url.trim() !== "";

  const handleBlur = () => {
    const result = onUrlBlur(urlDraft);
    if (result === "invalid") {
      setUrlDraft(source.url); // roll back the field to last committed value
    }
  };

  const openLink = (
    <a
      data-testid={`sources-open-${index}`}
      href={hasUrl ? source.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open source in new tab"
      className={
        hasUrl
          ? "text-accent hover:text-accent flex-shrink-0"
          : "text-mute pointer-events-none flex-shrink-0"
      }
    >
      <ExternalLink size={12} />
    </a>
  );

  if (readOnly) {
    return (
      <div
        data-testid={`sources-row-${index}`}
        className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-line text-xs"
      >
        <span className="flex-1 min-w-0 text-ink truncate" title={source.url}>
          {label}
        </span>
        {openLink}
      </div>
    );
  }

  return (
    <div
      data-testid={`sources-row-${index}`}
      className="flex flex-col gap-1 px-2 py-1.5 rounded bg-surface-2 border border-line text-xs"
    >
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          data-testid={`sources-title-input-${index}`}
          value={source.title ?? ""}
          placeholder={label || "Title"}
          onChange={(e) => onTitleChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-mute outline-none"
        />
        {openLink}
        <button
          type="button"
          data-testid={`sources-remove-${index}`}
          onClick={onRemove}
          aria-label="Remove source"
          className="text-mute hover:text-danger flex-shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <input
        type="url"
        data-testid={`sources-url-input-${index}`}
        value={urlDraft}
        placeholder="https://…"
        onChange={(e) => setUrlDraft(e.target.value)}
        onBlur={handleBlur}
        className={`bg-transparent text-mute placeholder:text-mute outline-none ${
          error ? "text-danger" : ""
        }`}
      />
      {error && (
        <span data-testid={`sources-error-${index}`} className="text-[10px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
