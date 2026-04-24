// src/app/knowledge_base/extensions/wikiLink.ts
import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { resolveWikiLinkPath } from "../utils/wikiLinkParser";

export interface WikiLinkOptions {
  onNavigate?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  allDocPaths?: string[];
  existingDocPaths?: Set<string>;
  /** Directory of the current document, used to resolve relative wiki-link paths. */
  currentDocDir?: string;
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

      return {
        dom,
        update(updated) {
          if (updated.type.name !== "wikiLink") return false;
          paintFromAttrs(updated);
          return true;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
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
              options.onCreateDocument?.(path);
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
          const paths = this.options.allDocPaths ?? [];
          if (!query) return paths.slice(0, 10);
          const lower = query.toLowerCase();
          return paths.filter(p => p.toLowerCase().includes(lower)).slice(0, 10);
        },
        render: () => {
          let popup: HTMLDivElement | null = null;
          let selectedIndex = 0;
          let items: string[] = [];
          let commandFn: ((props: { id: string }) => void) | null = null;

          function updatePopup() {
            if (!popup) return;
            popup.innerHTML = items.map((item, i) =>
              `<div class="px-3 py-1.5 text-xs cursor-pointer ${
                i === selectedIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
              }" data-index="${i}">${item}</div>`
            ).join("");
            popup.querySelectorAll("[data-index]").forEach(el => {
              el.addEventListener("click", () => {
                commandFn?.({ id: (el as HTMLElement).textContent ?? "" });
              });
            });
          }

          return {
            onStart(props) {
              commandFn = (attrs) => {
                props.command({ id: attrs.id });
              };
              items = props.items as string[];
              popup = document.createElement("div");
              popup.className = "bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-48 overflow-auto z-50";
              popup.style.position = "fixed";
              updatePopup();
              const { view } = props.editor;
              const coords = view.coordsAtPos(props.range.from);
              popup.style.left = `${coords.left}px`;
              popup.style.top = `${coords.bottom + 4}px`;
              document.body.appendChild(popup);
            },
            onUpdate(props) {
              items = props.items as string[];
              commandFn = (attrs) => props.command({ id: attrs.id });
              selectedIndex = 0;
              updatePopup();
            },
            onKeyDown(props) {
              if (props.event.key === "ArrowDown") {
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updatePopup();
                return true;
              }
              if (props.event.key === "ArrowUp") {
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updatePopup();
                return true;
              }
              if (props.event.key === "Enter") {
                commandFn?.({ id: items[selectedIndex] });
                return true;
              }
              return false;
            },
            onExit() {
              popup?.remove();
              popup = null;
            },
          };
        },
        command: ({ editor, range, props }) => {
          const path = (props as { id: string }).id;
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
