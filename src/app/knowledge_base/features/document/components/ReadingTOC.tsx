"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ReadingMeta } from "./MarkdownEditor";

const MIN_VIEWPORT_WIDTH = 1100;

interface ReadingTOCProps {
  /** Headings + word count derived in MarkdownEditor.  When the doc has
   *  fewer than 3 headings, ReadingTOC renders nothing — the component is
   *  always mounted in read mode but only paints when the doc earns it. */
  headings: ReadingMeta["headings"];
  /** Container the editor scrolls inside.  Used both for scrollspy and for
   *  click-to-scroll, so the user's click moves the same container they
   *  were just scrolling. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/** Sticky right-rail Table of Contents shown only in read mode.
 *
 *  Visibility rules:
 *  - hidden when fewer than 3 headings (avoids clutter on short notes),
 *  - hidden below 1100px viewport (no room beside 70ch measure),
 *  - hidden when the user toggles it off via ⌘⇧O (state lifted to the
 *    parent so the command palette can drive it).
 *
 *  Active-entry highlight uses an IntersectionObserver against the headings
 *  inside the scroll container, so the highlight is anchored to what the
 *  reader actually sees — not to where the page-level scroll happens. */
export default function ReadingTOC({
  headings,
  scrollContainerRef,
}: ReadingTOCProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewportWide, setViewportWide] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth >= MIN_VIEWPORT_WIDTH,
  );
  // Hold a stable ref to the latest headings so the IntersectionObserver
  // callback doesn't capture a stale array between document switches.
  const headingsRef = useRef(headings);
  useEffect(() => {
    headingsRef.current = headings;
  }, [headings]);

  // Track viewport width — the rail is for desktop reading layouts only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWide(window.innerWidth >= MIN_VIEWPORT_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Set up scrollspy.  Re-bind whenever the heading set or the scroll root
  // changes — switching files swaps both, so a single observer per render
  // pass keeps highlights honest.
  useEffect(() => {
    if (!viewportWide) return;
    if (headings.length < 3) return;
    const root = scrollContainerRef.current;
    if (!root) return;

    // Resolve heading IDs to live nodes inside the root. The IDs are stamped
    // by `extractReadingMeta` in MarkdownEditor; `querySelector` on the live
    // root finds them again here.
    const targets: Element[] = [];
    headings.forEach((h) => {
      const el = root.querySelector(`#${CSS.escape(h.id)}`);
      if (el) targets.push(el);
    });
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting entry; if none intersect (user is
        // between sections) keep the previous active id.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0].target.id;
        if (id) setActiveId(id);
      },
      // Top margin pulls the trigger zone down ~10% so the highlight
      // updates as the heading approaches the top of the reading area
      // rather than only when it's already passed.
      { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [headings, scrollContainerRef, viewportWide]);

  if (headings.length < 3) return null;
  if (!viewportWide) return null;

  const handleClick = (id: string) => {
    const root = scrollContainerRef.current;
    if (!root) return;
    const target = root.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
    if (!target) return;
    // smooth-scroll the editor scroll container so the heading sits at the
    // top with a small breathing margin.
    const targetTop = target.offsetTop - 16;
    root.scrollTo({ top: targetTop, behavior: "smooth" });
    setActiveId(id);
  };

  return (
    <nav
      data-testid="reading-toc"
      // Width gating happens above via `viewportWide` (1100px threshold) —
      // not Tailwind's `xl` (1280px) which would create a dead zone between
      // the two breakpoints where the JS says render but CSS hides.
      className="flex-shrink-0 w-56 px-4 py-6 overflow-y-auto border-l border-slate-100 bg-white"
      aria-label="Table of contents"
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
        On this page
      </div>
      <ul className="space-y-1 text-sm">
        {headings.map((h) => {
          const indent = h.level === 1 ? 0 : h.level === 2 ? 16 : 32;
          const active = h.id === activeId;
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => handleClick(h.id)}
                style={{ paddingLeft: indent }}
                className={`block w-full text-left py-1 transition-colors rounded ${
                  active
                    ? "text-amber-700 font-medium"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title={h.text}
              >
                <span className="line-clamp-2">{h.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
