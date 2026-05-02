"use client";

/**
 * useDerivedDocumentTitle — debounced first-heading derivation for the
 * document pane title (DOC-4.13). Wraps `getFirstHeading` behind a 250 ms
 * debounce and a prefix-based skip (KB-043): if `content.slice(0, 200)`
 * hasn't changed since the last parse, the parse is skipped entirely.
 * That cuts the runaway `getFirstHeading` calls a long body's keystrokes
 * would otherwise produce while still letting a heading edit settle the
 * title within ~250 ms.
 */

import { useEffect, useRef, useState } from "react";
import { getFirstHeading } from "../utils/getFirstHeading";

export const TITLE_DEBOUNCE_MS = 250;

/** First 200 chars are enough to cover the YAML frontmatter + a typical
 *  H1 line, which is the only window `getFirstHeading` reads to settle. */
const PREFIX_WINDOW = 200;

export function useDerivedDocumentTitle(
  content: string,
  fallback: string,
): string {
  const [title, setTitle] = useState<string>(
    () => getFirstHeading(content) || fallback,
  );
  // Cache (prefix, parsed heading) so a tail-only edit can short-circuit
  // the parse but a fallback change (file switch) still resolves the
  // title against the cached heading without re-parsing.
  const cacheRef = useRef<{ prefix: string; heading: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const prefix = content.slice(0, PREFIX_WINDOW);
      let cached = cacheRef.current;
      if (!cached || cached.prefix !== prefix) {
        cached = { prefix, heading: getFirstHeading(content) };
        cacheRef.current = cached;
      }
      setTitle(cached.heading || fallback);
    }, TITLE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content, fallback]);

  return title;
}
