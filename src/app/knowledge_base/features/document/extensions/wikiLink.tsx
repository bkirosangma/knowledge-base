// src/app/knowledge_base/extensions/wikiLink.tsx
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { FolderPicker } from "../components/FolderPicker";
import type { TreeNode } from "../../../shared/utils/fileTree";

export interface WikiLinkHoverPayload {
  /** Bounding rect of the link DOM at hover time. */
  rect: DOMRect;
  /** Path as written in `[[…]]`. */
  path: string;
  /** Resolved vault-relative target path that exists, or `null` for broken links. */
  resolvedPath: string | null;
}

export interface WikiLinkOptions {
  onNavigate?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  allDocPaths?: string[];
  existingDocPaths?: Set<string>;
  /** Directory of the current document, used to resolve relative wiki-link paths. */
  currentDocDir?: string;
  /** Full file tree, used to render the folder-picker when `[[` is triggered. */
  tree?: TreeNode[];
  /** Mouse entered a wiki-link DOM node. The host owns the 200ms delay timer
   *  + portal card; the extension just reports the hover. */
  onHover?: (payload: WikiLinkHoverPayload) => void;
  /** Mouse left a wiki-link DOM node. The host's dismiss logic decides whether
   *  to actually close (e.g. small overshoot tolerance, or the mouse moved
   *  onto the card itself). */
  onHoverEnd?: () => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (path: string, section?: string) => ReturnType;
    };
  }
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      onNavigate: undefined,
      onCreateDocument: undefined,
      allDocPaths: [],
      existingDocPaths: new Set(),
      currentDocDir: "",
      tree: undefined,
      onHover: undefined,
      onHoverEnd: undefined,
    };
  },

  addAttributes() {
    return {
      path: { default: null },
      section: { default: null },
      display: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wiki-link]',
        getAttrs(dom) {
          const el = dom as HTMLElement;
          return {
            path: el.dataset.wikiLink,
            section: el.dataset.wikiSection ?? null,
            display: el.textContent,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const path = node.attrs.path as string;
    const section = node.attrs.section as string | null;
    const display = node.attrs.display ?? (section ? `${path}#${section}` : path);
    const exists = this.options.existingDocPaths?.has(
      path.endsWith(".md") ? path : `${path}.md`
    );

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": path,
        ...(section ? { "data-wiki-section": section } : {}),
        class: `wiki-link cursor-pointer inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
          exists
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "bg-red-100 text-red-600 hover:bg-red-200"
        }`,
        title: exists ? `Open ${path}` : `${path} (not found — click to create)`,
      }),
      display,
    ];
  },

  addCommands() {
    return {
      insertWikiLink:
        (path, section) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { path, section, display: section ? `${path}#${section}` : path },
          });
        },
    };
  },

  addNodeView() {
    const extOptions = this.options;
    return ({ node }) => {
      const dom = document.createElement("span");

      // Icons mirrored from lucide-react (FileText, Workflow) so this stays
      // visually consistent with the toolbar / popover icons elsewhere.
      const ICON_DOC =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
      const ICON_DIAGRAM =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>';

      // Which candidate paths should be checked for a wiki-link target?
      // Mirrors the order used by `handleNavigateWikiLink` in knowledgeBase.tsx
      // so rendering (blue/red) stays consistent with click behavior.
      const candidatesFor = (p: string): string[] => {
        const dir = this.options.currentDocDir ?? "";
        const list: string[] = [];
        // 1. Relative to current doc (default .md).
        list.push(resolveWikiLinkPath(p, dir));
        // 2. Relative .json for diagrams.
        if (!/\.[a-z0-9]+$/i.test(p)) {
          const relBase = dir ? `${dir}/${p}` : p;
          list.push(`${relBase}.json`);
        }
        // 3. As-written.
        list.push(p);
        // 4. Root-level fallbacks.
        if (!/\.[a-z0-9]+$/i.test(p)) {
          list.push(`${p}.md`, `${p}.json`);
        }
        return list;
      };

      const resolveExistingPath = (p: string): string | null => {
        const set = this.options.existingDocPaths;
        if (!set) return null;
        for (const c of candidatesFor(p)) if (set.has(c)) return c;
        return null;
      };

      const detectKind = (p: string): "doc" | "diagram" => {
        const resolved = resolveExistingPath(p);
        if (resolved && /\.json$/i.test(resolved)) return "diagram";
        if (resolved && /\.md$/i.test(resolved)) return "doc";
        // Unresolved — fall back to path suffix.
        return /\.json$/i.test(p) ? "diagram" : "doc";
      };

      const resolveExists = (p: string) => resolveExistingPath(p) !== null;

      // Two-part DOM: a fixed icon slot + a text slot we mutate on update().
      // Keeping them separate lets the inline-edit plugin write to the label
      // without re-painting (and re-mounting) the SVG on every keystroke.
      const iconEl = document.createElement("span");
      iconEl.className = "wiki-link-icon inline-flex shrink-0 mr-1 opacity-80";
      const textEl = document.createElement("span");
      textEl.className = "wiki-link-text";
      dom.appendChild(iconEl);
      dom.appendChild(textEl);

      const paintFromAttrs = (n: typeof node) => {
        const path = n.attrs.path as string;
        const section = n.attrs.section as string | null;
        const display =
          (n.attrs.display as string | null) ??
          (section ? `${path}#${section}` : path);
        const exists = resolveExists(path);
        const kind = detectKind(path);
        // Expose attributes on the live DOM so e2e tests + delegated hover
        // listeners can target wiki-links by selector (`[data-wiki-link]`).
        // renderHTML stamps these on serialised output already; mirroring
        // here keeps the nodeView and parsed HTML interchangeable.
        dom.setAttribute("data-wiki-link", path);
        if (section) dom.setAttribute("data-wiki-section", section);
        else dom.removeAttribute("data-wiki-section");
        dom.className = `wiki-link cursor-pointer inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
          exists
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "bg-red-100 text-red-600 hover:bg-red-200"
        }`;
        const desiredIcon = kind === "diagram" ? ICON_DIAGRAM : ICON_DOC;
        if (iconEl.dataset.kind !== kind) {
          iconEl.dataset.kind = kind;
          iconEl.innerHTML = desiredIcon;
        }
        if (textEl.textContent !== display) textEl.textContent = display;
        const kindLabel = kind === "diagram" ? "diagram" : "doc";
        dom.title = exists
          ? `Open ${kindLabel} ${path}`
          : `${path} (not found — click to create)`;
      };
      paintFromAttrs(node);

      // NB: no DOM click listener here — clicks are handled by the
      // `handleClickOn` prop in addProseMirrorPlugins so that list-item
      // wrappers (and any other PM-managed container) can't eat the event.

      // Hover preview wiring (DOC-4.17). The host (MarkdownEditor) owns the
      // 200ms delay timer and the portal card; we just emit raw mouseenter /
      // mouseleave with the link rect + resolution result so the host can
      // decide whether to show, and where.
      const handleMouseEnter = () => {
        const onHover = extOptions.onHover;
        if (!onHover) return;
        const path = (node.attrs.path as string) ?? "";
        onHover({
          rect: dom.getBoundingClientRect(),
          path,
          resolvedPath: resolveExistingPath(path),
        });
      };
      const handleMouseLeave = () => {
        extOptions.onHoverEnd?.();
      };
      dom.addEventListener("mouseenter", handleMouseEnter);
      dom.addEventListener("mouseleave", handleMouseLeave);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== "wikiLink") return false;
          paintFromAttrs(updated);
          return true;
        },
        destroy() {
          dom.removeEventListener("mouseenter", handleMouseEnter);
          dom.removeEventListener("mouseleave", handleMouseLeave);
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    // Capture options object reference — mutations (tree, currentDocDir, etc.) are visible via this ref
    const options = this.options;
    return [
      // Inline text editing AND navigation. DOM-level click handlers on atoms
      // get eaten in some container contexts (notably inside list items) —
      // ProseMirror `handleClickOn` fires reliably for any direct click on
      // the node, so we centralize both edit-mode select and read-mode
      // navigation here.
      new Plugin({
        key: new PluginKey("wikiLinkInlineEdit"),
        props: {
          handleClickOn(view, _pos, node, nodePos, event, direct) {
            if (!direct) return false;
            if (node.type.name !== "wikiLink") return false;
            event.preventDefault();
            event.stopPropagation();
            if (view.editable) {
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, nodePos),
                ),
              );
              (view.dom as HTMLElement).focus();
              return true;
            }
            // Read mode: navigate (or create if unresolved). Mirrors the
            // candidate resolution used by the nodeView so rendering and
            // click behavior agree.
            const path = node.attrs.path as string;
            const section = node.attrs.section as string | null;
            const dir = options.currentDocDir ?? "";
            const set = options.existingDocPaths ?? new Set<string>();
            const candidates: string[] = [];
            candidates.push(resolveWikiLinkPath(path, dir));
            if (!/\.[a-z0-9]+$/i.test(path)) {
              const relBase = dir ? `${dir}/${path}` : path;
              candidates.push(`${relBase}.json`);
            }
            candidates.push(path);
            if (!/\.[a-z0-9]+$/i.test(path)) {
              candidates.push(`${path}.md`, `${path}.json`);
            }
            const exists = candidates.some((c) => set.has(c));
            if (exists) {
              options.onNavigate?.(path, section ?? undefined);
            } else {
              // Create with the fully-resolved path so the file lands with the
              // correct extension (e.g. "missing-doc.md" not "missing-doc").
              options.onCreateDocument?.(candidates[0]);
            }
            return true;
          },
          handleKeyDown(view, event) {
            if (!view.editable) return false;
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            const sel = view.state.selection;
            if (!(sel instanceof NodeSelection)) return false;
            if (sel.node.type.name !== "wikiLink") return false;

            const pos = sel.from;
            const node = view.state.doc.nodeAt(pos);
            if (!node || node.type.name !== "wikiLink") return false;
            const section = node.attrs.section as string | null;
            const path = node.attrs.path as string;
            const curDisplay =
              (node.attrs.display as string | null) ??
              (section ? `${path}#${section}` : path);

            const commit = (next: string) => {
              editor
                .chain()
                .command(({ tr }) => {
                  tr.setNodeMarkup(pos, null, {
                    ...node.attrs,
                    display: next,
                  });
                  return true;
                })
                .setNodeSelection(pos)
                .run();
            };

            if (event.key === "Backspace") {
              if (curDisplay.length === 0) return false; // let default delete the atom
              event.preventDefault();
              commit(curDisplay.slice(0, -1));
              return true;
            }
            if (event.key === "Delete") {
              // Same as Backspace for a label — we only expose one caret edge.
              if (curDisplay.length === 0) return false;
              event.preventDefault();
              commit(curDisplay.slice(0, -1));
              return true;
            }
            if (event.key.length === 1) {
              event.preventDefault();
              commit(curDisplay + event.key);
              return true;
            }
            return false;
          },
        },
      }),
      Suggestion({
        editor: this.editor,
        char: "[[",
        items: ({ query }) => {
          const paths = options.allDocPaths ?? [];
          // Empty query → picker mode; return single dummy to keep suggestion alive
          if (!query) return [""];
          const lower = query.toLowerCase();
          const filtered = paths
            .filter((p) => p.toLowerCase().includes(lower))
            .slice(0, 10);
          // Fall back to raw query so items never becomes empty (avoids premature onExit)
          return filtered.length > 0 ? filtered : [query];
        },
        render: () => {
          let popup: HTMLDivElement | null = null;
          let reactRoot: Root | null = null;
          let currentMode: "picker" | "list" = "picker";
          let currentItems: string[] = [];
          let selectedIndex = 0;
          let commandFn: ((attrs: { id: string }) => void) | null = null;

          function renderList() {
            if (!popup) return;
            popup.innerHTML = currentItems
              .map((item, i) => {
                const hl =
                  i === selectedIndex
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50";
                return `<div class="px-3 py-1.5 text-xs cursor-pointer ${hl}" data-index="${i}">${item}</div>`;
              })
              .join("");
            popup.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => {
              el.addEventListener("click", () => {
                commandFn?.({ id: el.textContent ?? "" });
              });
            });
          }

          function enterListMode() {
            if (currentMode === "picker" && reactRoot) {
              reactRoot.unmount();
              reactRoot = null;
            }
            currentMode = "list";
            if (popup) {
              popup.className =
                "bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-48 overflow-auto";
            }
            renderList();
          }

          function enterPickerMode() {
            const tree = options.tree;
            if (!tree || tree.length === 0) {
              // No tree available — fall back to flat list
              enterListMode();
              return;
            }
            currentMode = "picker";
            if (popup) popup.className = "";
            if (!reactRoot) reactRoot = createRoot(popup!);
            reactRoot.render(
              <FolderPicker
                tree={tree}
                startPath={options.currentDocDir ?? ""}
                onSelect={(path) => commandFn?.({ id: path })}
              />
            );
          }

          return {
            onStart(props) {
              commandFn = (attrs) => props.command({ id: attrs.id });
              currentItems = props.items as string[];
              popup = document.createElement("div");
              popup.style.position = "fixed";
              popup.style.zIndex = "50";
              const coords = props.editor.view.coordsAtPos(props.range.from);
              popup.style.left = `${Math.min(coords.left, window.innerWidth - 248)}px`;
              popup.style.top = `${coords.bottom + 4}px`;
              document.body.appendChild(popup);
              enterPickerMode();
            },
            onUpdate(props) {
              currentItems = props.items as string[];
              commandFn = (attrs) => props.command({ id: attrs.id });
              selectedIndex = 0;
              const query = (props as { query: string }).query;
              if (!query) {
                if (currentMode !== "picker") enterPickerMode();
                // Already in picker — commandFn closure updated above, no re-render needed
              } else {
                if (currentMode !== "list") enterListMode();
                else renderList();
              }
            },
            onKeyDown(props) {
              if (currentMode === "picker") {
                // Block arrow keys and Enter to prevent editor cursor movement
                // while the folder picker is open. Other keys (printable chars)
                // fall through so typing switches to list mode via onUpdate.
                if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(props.event.key)) {
                  return true;
                }
                return false;
              }
              if (props.event.key === "ArrowDown") {
                selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
                renderList();
                return true;
              }
              if (props.event.key === "ArrowUp") {
                selectedIndex = Math.max(selectedIndex - 1, 0);
                renderList();
                return true;
              }
              if (props.event.key === "Enter") {
                commandFn?.({ id: currentItems[selectedIndex] });
                return true;
              }
              return false;
            },
            onExit() {
              reactRoot?.unmount();
              reactRoot = null;
              popup?.remove();
              popup = null;
            },
          };
        },
        command: ({ editor, range, props }) => {
          const path = (props as { id: string }).id;
          // Ignore the dummy empty-string item used to keep the suggestion alive in picker mode
          if (!path) return;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertWikiLink(path)
            .run();
        },
      }),
    ];
  },
});
