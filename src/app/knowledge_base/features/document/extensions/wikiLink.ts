// src/app/knowledge_base/extensions/wikiLink.ts
import { Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

export interface WikiLinkOptions {
  onNavigate?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  allDocPaths?: string[];
  existingDocPaths?: Set<string>;
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
      const path = node.attrs.path as string;
      const section = node.attrs.section as string | null;
      const display = node.attrs.display ?? (section ? `${path}#${section}` : path);
      const exists = this.options.existingDocPaths?.has(
        path.endsWith(".md") ? path : `${path}.md`
      );

      dom.className = `wiki-link cursor-pointer inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
        exists
          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
          : "bg-red-100 text-red-600 hover:bg-red-200"
      }`;
      dom.textContent = display;
      dom.title = exists ? `Open ${path}` : `${path} (not found — click to create)`;

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (exists) {
          this.options.onNavigate?.(path, section ?? undefined);
        } else {
          this.options.onCreateDocument?.(path);
        }
      });

      return { dom };
    };
  },

  addProseMirrorPlugins() {
    return [
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
