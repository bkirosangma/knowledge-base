# Markdown Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-inspired Markdown Document system to architecture-designer — documents live alongside diagrams on disk, can be attached to diagram entities, linked via wiki-links, and edited with a Tiptap WYSIWYG/raw editor.

**Architecture:** The app already uses the browser's File System Access API via `useFileExplorer` hook (not localStorage) for diagram persistence. We extend this existing system to handle `.md` files, add a Tiptap editor, and introduce viewport mode switching. No Next.js API routes needed — all file I/O goes through the existing `FileSystemDirectoryHandle` layer. This is a deviation from the spec (which assumed API routes) based on discovering the actual codebase architecture.

**Tech Stack:** React 19, Next.js 16, Tiptap (ProseMirror), Tailwind CSS 4, File System Access API, Lucide React icons.

**Spec:** `docs/superpowers/specs/2026-04-11-markdown-documents-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/app/architecture_designer/components/MarkdownEditor.tsx` | Tiptap editor with WYSIWYG/raw toggle, GFM extensions |
| `src/app/architecture_designer/components/MarkdownPane.tsx` | Editor container: toolbar, title, backlinks indicator, breadcrumb |
| `src/app/architecture_designer/components/DocumentPicker.tsx` | Modal for attaching/creating documents for entities |
| `src/app/architecture_designer/components/SplitPane.tsx` | Resizable split layout for split viewport mode |
| `src/app/architecture_designer/components/DocInfoBadge.tsx` | Reusable ⓘ badge component for canvas elements |
| `src/app/architecture_designer/components/properties/DocumentsSection.tsx` | Reusable documents section for all property panels |
| `src/app/architecture_designer/extensions/wikiLink.ts` | Custom Tiptap extension: `[[wiki-link]]` node with autocomplete |
| `src/app/architecture_designer/extensions/markdownSerializer.ts` | Tiptap ↔ Markdown serialization (handles wiki-links in round-trip) |
| `src/app/architecture_designer/hooks/useDocuments.ts` | Document metadata state, attachment CRUD, vault-level doc registry |
| `src/app/architecture_designer/hooks/useLinkIndex.ts` | `_links.json` persistence, incremental updates, backlink lookups |
| `src/app/architecture_designer/utils/wikiLinkParser.ts` | Parse `[[...]]` syntax from raw markdown, resolve paths |
| `src/app/architecture_designer/utils/vaultConfig.ts` | Read/write `.archdesigner/config.json`, vault init logic |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/architecture_designer/utils/types.ts` | Add `ViewMode`, `DocumentMeta`, `LinkIndex`, `VaultConfig` types |
| `src/app/architecture_designer/hooks/useFileExplorer.ts` | Extend `scanTree()` to include `.md` files; add `readTextFile()`, `writeTextFile()`, `getSubdirectoryHandle()` helpers |
| `src/app/architecture_designer/components/Header.tsx` | Add viewport mode segmented toggle; conditionally hide diagram controls |
| `src/app/architecture_designer/components/explorer/ExplorerPanel.tsx` | Add file type filter toggles (Diagrams / Documents / All) |
| `src/app/architecture_designer/components/Element.tsx` | Add ⓘ `DocInfoBadge` on hover when element has attached docs |
| `src/app/architecture_designer/components/ConditionElement.tsx` | Add ⓘ `DocInfoBadge` on hover |
| `src/app/architecture_designer/components/DataLine.tsx` | Add ⓘ badge near connection label on hover |
| `src/app/architecture_designer/components/properties/shared.tsx` | Export `DocumentsSection` (or import from new file) |
| `src/app/architecture_designer/components/properties/PropertiesPanel.tsx` | Pass document props to all sub-panels |
| `src/app/architecture_designer/components/properties/NodeProperties.tsx` | Add `DocumentsSection` |
| `src/app/architecture_designer/components/properties/LineProperties.tsx` | Add `DocumentsSection` |
| `src/app/architecture_designer/components/properties/LayerProperties.tsx` | Add `DocumentsSection` |
| `src/app/architecture_designer/components/properties/ArchitectureProperties.tsx` | Add `DocumentsSection` for root, flows, types |
| `src/app/architecture_designer/architectureDesigner.tsx` | Add `viewMode` state, markdown pane rendering, split layout, document state wiring |

---

## Task 1: Types & Dependencies

**Files:**
- Modify: `src/app/architecture_designer/utils/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Add new types to types.ts**

Add these types after the existing `DiagramData` interface:

```typescript
export type ViewMode = 'diagram' | 'split' | 'document';

export interface DocumentMeta {
  id: string;
  filename: string;       // relative path from vault root
  title: string;
  attachedTo?: {
    type: 'root' | 'node' | 'connection' | 'flow' | 'type';
    id: string;
  }[];
}

export interface VaultConfig {
  version: string;
  name: string;
  created: string;
  lastOpened: string;
}

export interface LinkIndexEntry {
  outboundLinks: string[];
  sectionLinks: { targetPath: string; section: string }[];
}

export interface BacklinkEntry {
  linkedFrom: { sourcePath: string; section?: string }[];
}

export interface LinkIndex {
  updatedAt: string;
  documents: Record<string, LinkIndexEntry>;
  backlinks: Record<string, BacklinkEntry>;
}

export type ExplorerFilter = 'all' | 'diagrams' | 'documents';
```

Also add `documents?: DocumentMeta[]` to the existing `DiagramData` interface.

- [ ] **Step 2: Install Tiptap packages**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-image @tiptap/extension-code-block-lowlight lowlight
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/architecture_designer/utils/types.ts package.json package-lock.json
git commit -m "feat: add markdown document types and install Tiptap dependencies"
```

---

## Task 2: File System Extensions

**Files:**
- Modify: `src/app/architecture_designer/hooks/useFileExplorer.ts`
- Create: `src/app/architecture_designer/utils/vaultConfig.ts`

- [ ] **Step 1: Extend scanTree to include .md files**

In `useFileExplorer.ts`, the `scanTree` function (L93-120) currently filters to only `.json` files. Update it to also include `.md` files:

Find the line that checks for `.json` extension and change it to accept both `.json` and `.md`:

```typescript
// Before (in scanTree):
if (entry.kind === "file" && entry.name.endsWith(".json")) {

// After:
if (entry.kind === "file" && (entry.name.endsWith(".json") || entry.name.endsWith(".md"))) {
```

Also update the `TreeNode` interface to include a `fileType` discriminator:

```typescript
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  fileType?: "diagram" | "document";  // NEW — derived from extension
  children?: TreeNode[];
  handle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  lastModified?: number;
}
```

Set `fileType` in `scanTree`:

```typescript
fileType: entry.name.endsWith(".md") ? "document" : "diagram",
```

- [ ] **Step 2: Add readTextFile and writeTextFile helpers**

Add these exported utility functions to `useFileExplorer.ts` (before the `useFileExplorer` function):

```typescript
export async function readTextFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split("/");
  let current = dirHandle;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

export async function getSubdirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let current = rootHandle;
  for (const part of path.split("/").filter(Boolean)) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}
```

- [ ] **Step 3: Create vaultConfig.ts**

```typescript
// src/app/architecture_designer/utils/vaultConfig.ts
import type { VaultConfig } from "./types";

const CONFIG_DIR = ".archdesigner";
const CONFIG_FILE = "config.json";

export async function initVault(
  rootHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<VaultConfig> {
  const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR, { create: true });
  const now = new Date().toISOString();
  const config: VaultConfig = {
    version: "1.0",
    name,
    created: now,
    lastOpened: now,
  };
  const fileHandle = await configDir.getFileHandle(CONFIG_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(config, null, 2));
  await writable.close();
  return config;
}

export async function readVaultConfig(
  rootHandle: FileSystemDirectoryHandle,
): Promise<VaultConfig | null> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as VaultConfig;
  } catch {
    return null;
  }
}

export async function updateVaultLastOpened(
  rootHandle: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const config: VaultConfig = JSON.parse(await file.text());
    config.lastOpened = new Date().toISOString();
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(config, null, 2));
    await writable.close();
  } catch {
    // Config doesn't exist — not a vault
  }
}

export function isVaultDirectory(config: VaultConfig | null): boolean {
  return config !== null && config.version != null;
}
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/architecture_designer/hooks/useFileExplorer.ts src/app/architecture_designer/utils/vaultConfig.ts src/app/architecture_designer/utils/types.ts
git commit -m "feat: extend File System API for .md files and add vault config"
```

---

## Task 3: Wiki-Link Parser

**Files:**
- Create: `src/app/architecture_designer/utils/wikiLinkParser.ts`

- [ ] **Step 1: Create the parser**

```typescript
// src/app/architecture_designer/utils/wikiLinkParser.ts

export interface ParsedWikiLink {
  raw: string;          // full match including [[ ]]
  path: string;         // file path (may be relative or absolute)
  section?: string;     // heading anchor after #
  displayText?: string; // optional alias after |
}

const WIKI_LINK_REGEX = /\[\[([^\]]+?)\]\]/g;

export function parseWikiLinks(markdown: string): ParsedWikiLink[] {
  const results: ParsedWikiLink[] = [];
  let match;
  while ((match = WIKI_LINK_REGEX.exec(markdown)) !== null) {
    const inner = match[1];
    const [pathAndSection, displayText] = inner.split("|").map(s => s.trim());
    const [path, section] = pathAndSection.split("#").map(s => s.trim());
    results.push({
      raw: match[0],
      path,
      section: section || undefined,
      displayText: displayText || undefined,
    });
  }
  return results;
}

/**
 * Resolve a wiki-link path relative to the current document's directory.
 * - "/absolute/path" → resolved from vault root
 * - "relative/path" → resolved from current doc's directory
 * - "name" → same directory
 * Appends .md if not present.
 */
export function resolveWikiLinkPath(
  linkPath: string,
  currentDocDir: string,
): string {
  let resolved: string;
  if (linkPath.startsWith("/")) {
    // Absolute from vault root — strip leading slash
    resolved = linkPath.slice(1);
  } else {
    // Relative to current document's directory
    resolved = currentDocDir ? `${currentDocDir}/${linkPath}` : linkPath;
  }
  // Normalize path: remove double slashes, resolve . and ..
  const parts = resolved.split("/").filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === ".." && normalized.length > 0) { normalized.pop(); continue; }
    normalized.push(part);
  }
  resolved = normalized.join("/");
  // Append .md if no extension
  if (!resolved.endsWith(".md")) {
    resolved += ".md";
  }
  return resolved;
}

/**
 * Replace all wiki-link references to oldPath with newPath in markdown content.
 * Returns the updated markdown string.
 */
export function updateWikiLinkPaths(
  markdown: string,
  oldPath: string,
  newPath: string,
): string {
  // Strip .md for comparison
  const oldBase = oldPath.replace(/\.md$/, "");
  const newBase = newPath.replace(/\.md$/, "");
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection, displayText] = inner.split("|").map((s: string) => s.trim());
    const [linkPath, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const normalized = linkPath.replace(/\.md$/, "");
    if (normalized === oldBase || normalized === `/${oldBase}`) {
      const prefix = linkPath.startsWith("/") ? "/" : "";
      let replacement = `${prefix}${newBase}`;
      if (section) replacement += `#${section}`;
      if (displayText) replacement += ` | ${displayText}`;
      return `[[${replacement}]]`;
    }
    return fullMatch;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/architecture_designer/utils/wikiLinkParser.ts
git commit -m "feat: add wiki-link parser with path resolution and update logic"
```

---

## Task 4: Link Index System

**Files:**
- Create: `src/app/architecture_designer/hooks/useLinkIndex.ts`

- [ ] **Step 1: Create the useLinkIndex hook**

```typescript
// src/app/architecture_designer/hooks/useLinkIndex.ts
"use client";

import { useState, useCallback } from "react";
import type { LinkIndex } from "../utils/types";
import { parseWikiLinks, resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { readTextFile, writeTextFile, getSubdirectoryHandle } from "./useFileExplorer";

const LINKS_FILE = "_links.json";
const CONFIG_DIR = ".archdesigner";

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

function rebuildBacklinks(index: LinkIndex): void {
  index.backlinks = {};
  for (const [sourcePath, entry] of Object.entries(index.documents)) {
    for (const targetPath of entry.outboundLinks) {
      if (!index.backlinks[targetPath]) {
        index.backlinks[targetPath] = { linkedFrom: [] };
      }
      index.backlinks[targetPath].linkedFrom.push({ sourcePath });
    }
    for (const sl of entry.sectionLinks) {
      if (!index.backlinks[sl.targetPath]) {
        index.backlinks[sl.targetPath] = { linkedFrom: [] };
      }
      index.backlinks[sl.targetPath].linkedFrom.push({
        sourcePath,
        section: sl.section,
      });
    }
  }
}

export function useLinkIndex() {
  const [linkIndex, setLinkIndex] = useState<LinkIndex>(emptyIndex);

  const loadIndex = useCallback(async (rootHandle: FileSystemDirectoryHandle) => {
    try {
      const configDir = await getSubdirectoryHandle(rootHandle, CONFIG_DIR);
      const fileHandle = await configDir.getFileHandle(LINKS_FILE);
      const text = await readTextFile(fileHandle);
      const parsed: LinkIndex = JSON.parse(text);
      setLinkIndex(parsed);
      return parsed;
    } catch {
      const fresh = emptyIndex();
      setLinkIndex(fresh);
      return fresh;
    }
  }, []);

  const saveIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    index: LinkIndex,
  ) => {
    index.updatedAt = new Date().toISOString();
    await writeTextFile(rootHandle, `${CONFIG_DIR}/${LINKS_FILE}`, JSON.stringify(index, null, 2));
    setLinkIndex({ ...index });
  }, []);

  const updateDocumentLinks = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    markdownContent: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    const docDir = docPath.includes("/") ? docPath.substring(0, docPath.lastIndexOf("/")) : "";
    const parsed = parseWikiLinks(markdownContent);

    const outboundLinks: string[] = [];
    const sectionLinks: { targetPath: string; section: string }[] = [];

    for (const link of parsed) {
      const resolved = resolveWikiLinkPath(link.path, docDir);
      if (link.section) {
        sectionLinks.push({ targetPath: resolved, section: link.section });
      } else {
        outboundLinks.push(resolved);
      }
    }

    index.documents[docPath] = { outboundLinks, sectionLinks };
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const removeDocumentFromIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    delete index.documents[docPath];
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const renameDocumentInIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    oldPath: string,
    newPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    // Move the document's own entry
    if (index.documents[oldPath]) {
      index.documents[newPath] = index.documents[oldPath];
      delete index.documents[oldPath];
    }
    // Update all outbound links that pointed to oldPath
    for (const entry of Object.values(index.documents)) {
      entry.outboundLinks = entry.outboundLinks.map(p => p === oldPath ? newPath : p);
      entry.sectionLinks = entry.sectionLinks.map(sl =>
        sl.targetPath === oldPath ? { ...sl, targetPath: newPath } : sl
      );
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const getBacklinksFor = useCallback((docPath: string): { sourcePath: string; section?: string }[] => {
    return linkIndex.backlinks[docPath]?.linkedFrom ?? [];
  }, [linkIndex]);

  const fullRebuild = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    allDocPaths: string[],
  ) => {
    const index = emptyIndex();
    for (const docPath of allDocPaths) {
      try {
        const parts = docPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        const content = await readTextFile(fileHandle);
        const docDir = docPath.includes("/") ? docPath.substring(0, docPath.lastIndexOf("/")) : "";
        const parsed = parseWikiLinks(content);

        const outboundLinks: string[] = [];
        const sectionLinks: { targetPath: string; section: string }[] = [];
        for (const link of parsed) {
          const resolved = resolveWikiLinkPath(link.path, docDir);
          if (link.section) {
            sectionLinks.push({ targetPath: resolved, section: link.section });
          } else {
            outboundLinks.push(resolved);
          }
        }
        index.documents[docPath] = { outboundLinks, sectionLinks };
      } catch {
        // File read failed — skip
      }
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [saveIndex]);

  return {
    linkIndex,
    loadIndex,
    updateDocumentLinks,
    removeDocumentFromIndex,
    renameDocumentInIndex,
    getBacklinksFor,
    fullRebuild,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/architecture_designer/hooks/useLinkIndex.ts
git commit -m "feat: add useLinkIndex hook for persisted backlink index"
```

---

## Task 5: Markdown Editor Core

**Files:**
- Create: `src/app/architecture_designer/extensions/markdownSerializer.ts`
- Create: `src/app/architecture_designer/extensions/wikiLink.ts`
- Create: `src/app/architecture_designer/components/MarkdownEditor.tsx`

- [ ] **Step 1: Create markdown serializer**

This handles Tiptap JSON ↔ Markdown conversion, including wiki-link round-trips.

```typescript
// src/app/architecture_designer/extensions/markdownSerializer.ts

/**
 * Convert Tiptap HTML/JSON content to markdown string.
 * Uses a simple DOM-based approach since Tiptap content is essentially
 * structured HTML. Wiki-links are preserved as [[...]] in the output.
 */
export function htmlToMarkdown(html: string): string {
  // Create a temporary DOM element
  const div = document.createElement("div");
  div.innerHTML = html;
  return nodeToMarkdown(div).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join("");

  switch (tag) {
    case "h1": return `# ${children}\n\n`;
    case "h2": return `## ${children}\n\n`;
    case "h3": return `### ${children}\n\n`;
    case "h4": return `#### ${children}\n\n`;
    case "h5": return `##### ${children}\n\n`;
    case "h6": return `###### ${children}\n\n`;
    case "p": return `${children}\n\n`;
    case "strong": case "b": return `**${children}**`;
    case "em": case "i": return `*${children}*`;
    case "s": case "del": return `~~${children}~~`;
    case "code": {
      if (el.parentElement?.tagName.toLowerCase() === "pre") return children;
      return `\`${children}\``;
    }
    case "pre": {
      const lang = el.querySelector("code")?.className?.replace("language-", "") ?? "";
      const code = el.querySelector("code")?.textContent ?? children;
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case "blockquote": return children.split("\n").filter(Boolean).map(l => `> ${l}`).join("\n") + "\n\n";
    case "ul": return `${children}\n`;
    case "ol": return `${children}\n`;
    case "li": {
      const parent = el.parentElement?.tagName.toLowerCase();
      const prefix = parent === "ol"
        ? `${Array.from(el.parentElement!.children).indexOf(el) + 1}. `
        : "- ";
      // Handle task list items
      const checkbox = el.querySelector("input[type=checkbox]");
      if (checkbox) {
        const checked = (checkbox as HTMLInputElement).checked;
        const text = children.replace(/^\s*/, "");
        return `${prefix}[${checked ? "x" : " "}] ${text}\n`;
      }
      return `${prefix}${children}\n`;
    }
    case "hr": return "---\n\n";
    case "br": return "\n";
    case "a": {
      const href = el.getAttribute("href") ?? "";
      return `[${children}](${href})`;
    }
    case "img": {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      return `![${alt}](${src})`;
    }
    case "span": {
      // Wiki-link nodes are rendered as spans with data-wiki-link
      if (el.dataset.wikiLink) {
        const path = el.dataset.wikiLink;
        const section = el.dataset.wikiSection;
        let link = path;
        if (section) link += `#${section}`;
        return `[[${link}]]`;
      }
      return children;
    }
    case "table": return tableToMarkdown(el) + "\n\n";
    case "div": return children;
    default: return children;
  }
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(c => c.textContent?.trim() ?? "").join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}

/**
 * Convert markdown string to HTML for Tiptap to consume.
 * Handles wiki-links by converting [[...]] to <span data-wiki-link="...">
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Preserve wiki-links before other processing
  html = html.replace(/\[\[([^\]]+?)\]\]/g, (_match, inner: string) => {
    const [pathAndSection] = inner.split("|").map((s: string) => s.trim());
    const [path, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const display = inner.split("|")[1]?.trim() ?? inner.split("#")[0].trim();
    return `<span data-wiki-link="${path}"${section ? ` data-wiki-section="${section}"` : ""} class="wiki-link">${display}</span>`;
  });

  // Basic markdown to HTML (covers the essentials — Tiptap handles the rest)
  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  // Bold, italic, strikethrough, inline code
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");
  // Images and links
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  // Task lists
  html = html.replace(/^- \[x\]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">$1</li></ul>');
  html = html.replace(/^- \[ \]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">$1</li></ul>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<ul><li>$1</li></ul>");
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<ol><li>$1</li></ol>");
  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[a-z])(.*[^\n])$/gm, (_, content) => {
    if (!content.trim()) return "";
    return `<p>${content}</p>`;
  });

  return html;
}
```

- [ ] **Step 2: Create wiki-link Tiptap extension**

```typescript
// src/app/architecture_designer/extensions/wikiLink.ts
import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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
      `📄 ${display}`,
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
      dom.textContent = `📄 ${display}`;
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
      new Plugin({
        key: new PluginKey("wikiLinkBrokenHighlight"),
        props: {
          decorations: (state) => {
            // This plugin can be extended for inline broken-link highlighting
            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 3: Add [[wiki-link]] autocomplete trigger**

Install the suggestion utility:

```bash
npm install @tiptap/suggestion
```

Add an `addProseMirrorPlugins` method to the WikiLink extension in `wikiLink.ts` that uses `Suggestion` to trigger an autocomplete when the user types `[[`:

```typescript
import Suggestion from "@tiptap/suggestion";

// Replace the existing addProseMirrorPlugins() in the WikiLink extension:
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
        let command: ((props: { id: string }) => void) | null = null;

        function updatePopup() {
          if (!popup) return;
          popup.innerHTML = items.map((item, i) =>
            `<div class="px-3 py-1.5 text-xs cursor-pointer ${
              i === selectedIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
            }" data-index="${i}">📄 ${item}</div>`
          ).join("");
          popup.querySelectorAll("[data-index]").forEach(el => {
            el.addEventListener("click", () => {
              command?.({ id: (el as HTMLElement).textContent?.replace("📄 ", "") ?? "" });
            });
          });
        }

        return {
          onStart(props) {
            command = (attrs) => {
              props.command({ id: attrs.id });
            };
            items = props.items as string[];
            popup = document.createElement("div");
            popup.className = "bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-48 overflow-auto z-50";
            popup.style.position = "absolute";
            updatePopup();
            const { view } = props.editor;
            const coords = view.coordsAtPos(props.range.from);
            popup.style.left = `${coords.left}px`;
            popup.style.top = `${coords.bottom + 4}px`;
            document.body.appendChild(popup);
          },
          onUpdate(props) {
            items = props.items as string[];
            command = (attrs) => props.command({ id: attrs.id });
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
              command?.({ id: items[selectedIndex] });
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
```

- [ ] **Step 4: Create MarkdownEditor component**

(Note: Step numbers shifted — this was previously step 3)

```typescript
// src/app/architecture_designer/components/MarkdownEditor.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { WikiLink } from "../extensions/wikiLink";
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";

interface MarkdownEditorProps {
  content: string;                 // raw markdown string
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  readOnly?: boolean;
}

export default function MarkdownEditor({
  content,
  onChange,
  onNavigateLink,
  onCreateDocument,
  existingDocPaths,
  allDocPaths,
  readOnly = false,
}: MarkdownEditorProps) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawContent, setRawContent] = useState(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Image,
      WikiLink.configure({
        onNavigate: onNavigateLink,
        onCreateDocument,
        existingDocPaths,
        allDocPaths,
      }),
    ],
    content: markdownToHtml(content),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (!isRawMode) {
        const md = htmlToMarkdown(ed.getHTML());
        onChange?.(md);
      }
    },
  });

  // Sync content from parent when it changes externally
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentMd = htmlToMarkdown(editor.getHTML());
      if (currentMd.trim() !== content.trim()) {
        editor.commands.setContent(markdownToHtml(content));
        setRawContent(content);
      }
    }
  }, [content, editor]);

  // Update wiki-link extension options when doc paths change
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach(ext => {
        if (ext.name === "wikiLink") {
          ext.options.existingDocPaths = existingDocPaths;
          ext.options.allDocPaths = allDocPaths;
        }
      });
    }
  }, [editor, existingDocPaths, allDocPaths]);

  const handleToggleRawMode = useCallback(() => {
    if (!editor) return;
    if (isRawMode) {
      // Switching from raw → WYSIWYG
      editor.commands.setContent(markdownToHtml(rawContent));
      onChange?.(rawContent);
    } else {
      // Switching from WYSIWYG → raw
      const md = htmlToMarkdown(editor.getHTML());
      setRawContent(md);
    }
    setIsRawMode(!isRawMode);
  }, [editor, isRawMode, rawContent, onChange]);

  const handleRawChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawContent(e.target.value);
    onChange?.(e.target.value);
  }, [onChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Editor mode toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-xs">
        <button
          onClick={handleToggleRawMode}
          className={`px-2 py-1 rounded ${!isRawMode ? "bg-white shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          WYSIWYG
        </button>
        <button
          onClick={handleToggleRawMode}
          className={`px-2 py-1 rounded ${isRawMode ? "bg-white shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Raw
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto">
        {isRawMode ? (
          <textarea
            value={rawContent}
            onChange={handleRawChange}
            className="w-full h-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none outline-none"
            spellCheck={false}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none p-4 h-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/architecture_designer/extensions/ src/app/architecture_designer/components/MarkdownEditor.tsx package.json package-lock.json
git commit -m "feat: add Tiptap markdown editor with wiki-link extension and autocomplete"
```

---

## Task 6: Markdown Pane & Split Layout

**Files:**
- Create: `src/app/architecture_designer/components/MarkdownPane.tsx`
- Create: `src/app/architecture_designer/components/SplitPane.tsx`

- [ ] **Step 1: Create SplitPane component**

```typescript
// src/app/architecture_designer/components/SplitPane.tsx
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;   // 0-1, default 0.5
  storageKey?: string;     // localStorage key for persisting ratio
}

export default function SplitPane({
  left,
  right,
  defaultRatio = 0.5,
  storageKey = "split-pane-ratio",
}: SplitPaneProps) {
  const [ratio, setRatio] = useState(() => {
    if (typeof window === "undefined") return defaultRatio;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseFloat(stored) : defaultRatio;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
      setRatio(newRatio);
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem(storageKey, String(ratio));
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [ratio, storageKey]);

  return (
    <div ref={containerRef} className="flex h-full w-full">
      <div style={{ width: `${ratio * 100}%` }} className="overflow-hidden">
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1 bg-slate-300 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="overflow-hidden">
        {right}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MarkdownPane component**

```typescript
// src/app/architecture_designer/components/MarkdownPane.tsx
"use client";

import React, { useState } from "react";
import { FileText, ArrowLeft, ChevronRight } from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";

interface MarkdownPaneProps {
  filePath: string | null;           // currently open document path
  content: string;                   // raw markdown
  title: string;                     // document title (derived from filename)
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  onTitleChange?: (newTitle: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  backlinks?: { sourcePath: string; section?: string }[];
  onNavigateBacklink?: (sourcePath: string) => void;
  onClose?: () => void;
}

export default function MarkdownPane({
  filePath,
  content,
  title,
  onChange,
  onNavigateLink,
  onCreateDocument,
  onTitleChange,
  existingDocPaths,
  allDocPaths,
  backlinks = [],
  onNavigateBacklink,
  onClose,
}: MarkdownPaneProps) {
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <FileText size={48} strokeWidth={1} />
        <p className="mt-3 text-sm">No document selected</p>
        <p className="text-xs mt-1">Select a .md file from the explorer or click an element&apos;s ⓘ badge</p>
      </div>
    );
  }

  // Breadcrumb from file path
  const pathParts = filePath.split("/");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft size={16} />
          </button>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={10} />}
              <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1" />

        {/* Backlinks indicator */}
        {backlinks.length > 0 && (
          <button
            onClick={() => setShowBacklinks(!showBacklinks)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Title */}
      <div className="px-4 pt-3 pb-1">
        {isEditingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setIsEditingTitle(false);
              if (titleDraft.trim() && titleDraft !== title) {
                onTitleChange?.(titleDraft.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setTitleDraft(title); setIsEditingTitle(false); }
            }}
            className="text-lg font-semibold text-slate-900 outline-none border-b-2 border-blue-500 w-full bg-transparent"
          />
        ) : (
          <h1
            onClick={() => setIsEditingTitle(true)}
            className="text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
          >
            {title}
          </h1>
        )}
      </div>

      {/* Backlinks dropdown */}
      {showBacklinks && backlinks.length > 0 && (
        <div className="mx-4 mb-2 p-2 bg-slate-50 rounded border border-slate-200 text-xs">
          <div className="font-medium text-slate-500 mb-1">Referenced by:</div>
          {backlinks.map((bl, i) => (
            <button
              key={i}
              onClick={() => onNavigateBacklink?.(bl.sourcePath)}
              className="block w-full text-left px-2 py-1 rounded hover:bg-white text-blue-600 truncate"
            >
              {bl.sourcePath}{bl.section ? ` #${bl.section}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/architecture_designer/components/MarkdownPane.tsx src/app/architecture_designer/components/SplitPane.tsx
git commit -m "feat: add MarkdownPane container and SplitPane resizable layout"
```

---

## Task 7: Viewport Mode Switching

**Files:**
- Modify: `src/app/architecture_designer/components/Header.tsx`
- Modify: `src/app/architecture_designer/architectureDesigner.tsx`

- [ ] **Step 1: Add viewport mode toggle to Header**

Add `ViewMode` import and new props to `HeaderProps`:

```typescript
import type { ViewMode } from "../utils/types";

// Add to HeaderProps interface:
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
```

Add the segmented control JSX inside the Header component, after the title section and before the Live/Labels toggles. Insert this as a new group:

```typescript
{/* Viewport mode toggle */}
{onViewModeChange && (
  <div className="flex items-center bg-gray-800/50 rounded-md p-0.5 gap-0.5">
    {([
      { mode: "diagram" as ViewMode, label: "Diagram", icon: "📐" },
      { mode: "split" as ViewMode, label: "Split", icon: "⬜" },
      { mode: "document" as ViewMode, label: "Document", icon: "📄" },
    ]).map(({ mode, label, icon }) => (
      <button
        key={mode}
        onClick={() => onViewModeChange(mode)}
        className={`px-2.5 py-1 text-xs rounded transition-colors ${
          viewMode === mode
            ? "bg-white/20 text-white font-medium"
            : "text-gray-400 hover:text-gray-200"
        }`}
      >
        {icon} {label}
      </button>
    ))}
  </div>
)}
```

Conditionally hide diagram-specific controls (Live, Labels, Zoom, Minimap, Auto-Arrange) when `viewMode === "document"` by wrapping them in:

```typescript
{viewMode !== "document" && (
  // ... existing Live, Labels, Zoom, Minimap, Auto-Arrange controls
)}
```

- [ ] **Step 2: Add viewMode state and layout switching in architectureDesigner.tsx**

Add state near other UI state declarations:

```typescript
const [viewMode, setViewMode] = useState<ViewMode>("diagram");
const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
const [activeDocContent, setActiveDocContent] = useState("");
```

Pass to Header:

```typescript
<Header
  // ... existing props
  viewMode={viewMode}
  onViewModeChange={setViewMode}
/>
```

Update the center viewport section to conditionally render based on `viewMode`:

```typescript
{/* Center viewport */}
{viewMode === "diagram" && (
  // ... existing canvas content (unchanged)
)}
{viewMode === "split" && (
  <SplitPane
    left={/* existing canvas content */}
    right={
      <MarkdownPane
        filePath={activeDocPath}
        content={activeDocContent}
        title={activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
        onChange={(md) => setActiveDocContent(md)}
        // ... other props wired later
      />
    }
  />
)}
{viewMode === "document" && (
  <MarkdownPane
    filePath={activeDocPath}
    content={activeDocContent}
    title={activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
    onChange={(md) => setActiveDocContent(md)}
    // ... other props wired later
  />
)}
```

- [ ] **Step 3: Verify the app renders in all three modes**

```bash
npm run dev
```

Open the app, toggle between Diagram/Split/Document modes. Verify:
- Diagram mode shows the canvas (current behavior)
- Split mode shows canvas on left, empty markdown pane on right
- Document mode shows full-width empty markdown pane

- [ ] **Step 4: Commit**

```bash
git add src/app/architecture_designer/components/Header.tsx src/app/architecture_designer/architectureDesigner.tsx
git commit -m "feat: add viewport mode switching (diagram/split/document)"
```

---

## Task 8: Explorer File Type Filters

**Files:**
- Modify: `src/app/architecture_designer/components/explorer/ExplorerPanel.tsx`

- [ ] **Step 1: Add filter toggles to ExplorerPanel**

Add new prop to `ExplorerPanelProps`:

```typescript
import type { ExplorerFilter } from "../../utils/types";

// Add to ExplorerPanelProps:
  explorerFilter?: ExplorerFilter;
  onFilterChange?: (filter: ExplorerFilter) => void;
  onSelectDocument?: (path: string) => void;  // handler for .md files
```

Add filter buttons in the toolbar area (near the sort controls). Add a `useMemo` to filter the tree:

```typescript
const filteredTree = useMemo(() => {
  if (!explorerFilter || explorerFilter === "all") return tree;
  function filterNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .map(node => {
        if (node.type === "folder") {
          const children = filterNodes(node.children ?? []);
          if (children.length === 0) return null;
          return { ...node, children };
        }
        if (explorerFilter === "diagrams") return node.fileType === "diagram" ? node : null;
        if (explorerFilter === "documents") return node.fileType === "document" ? node : null;
        return node;
      })
      .filter((n): n is TreeNode => n !== null);
  }
  return filterNodes(tree);
}, [tree, explorerFilter]);
```

Use `filteredTree` instead of `tree` in the rendering loop.

Update the file click handler to dispatch `.md` files to `onSelectDocument` instead of `onSelectFile`:

```typescript
// In the file click handler:
if (node.fileType === "document" && onSelectDocument) {
  onSelectDocument(node.path);
} else {
  onSelectFile(node.path);
}
```

Add filter toggle buttons in the toolbar:

```typescript
<div className="flex items-center gap-0.5 text-[10px]">
  {(["all", "diagrams", "documents"] as ExplorerFilter[]).map(f => (
    <button
      key={f}
      onClick={() => onFilterChange?.(f)}
      className={`px-1.5 py-0.5 rounded ${
        explorerFilter === f ? "bg-blue-100 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {f === "all" ? "All" : f === "diagrams" ? "📐" : "📄"}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Add a file icon for .md files**

In the tree node rendering, add a markdown file icon (use `FileText` from Lucide) next to `.md` files, alongside the existing `FileJson` icon for `.json` files:

```typescript
import { FileText } from "lucide-react";

// In the tree item rendering:
{node.type === "file" && (
  node.fileType === "document"
    ? <FileText size={14} className="text-emerald-500 flex-shrink-0" />
    : <FileJson size={14} className="text-blue-400 flex-shrink-0" />
)}
```

- [ ] **Step 3: Wire filter props in architectureDesigner.tsx**

Add state and pass to ExplorerPanel:

```typescript
const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");

// In ExplorerPanel usage:
<ExplorerPanel
  // ... existing props
  explorerFilter={explorerFilter}
  onFilterChange={setExplorerFilter}
  onSelectDocument={(path) => {
    setActiveDocPath(path);
    // Load document content from File System Access API
    // (implementation in Task 10)
    if (viewMode === "diagram") setViewMode("split");
  }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/architecture_designer/components/explorer/ExplorerPanel.tsx src/app/architecture_designer/architectureDesigner.tsx
git commit -m "feat: add explorer file type filters and .md file handling"
```

---

## Task 9: Document State Management

**Files:**
- Create: `src/app/architecture_designer/hooks/useDocuments.ts`

- [ ] **Step 1: Create useDocuments hook**

This hook manages document metadata (attachments), reading/writing .md files from disk, and the active document state.

```typescript
// src/app/architecture_designer/hooks/useDocuments.ts
"use client";

import { useState, useCallback } from "react";
import type { DocumentMeta } from "../utils/types";
import { readTextFile, writeTextFile } from "./useFileExplorer";
import type { TreeNode } from "./useFileExplorer";

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [activeDocContent, setActiveDocContent] = useState("");
  const [docDirty, setDocDirty] = useState(false);

  /** Collect all .md file paths from the tree */
  const collectDocPaths = useCallback((tree: TreeNode[]): string[] => {
    const paths: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file" && node.fileType === "document") {
          paths.push(node.path);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
    return paths;
  }, []);

  const existingDocPaths = useCallback((tree: TreeNode[]): Set<string> => {
    return new Set(collectDocPaths(tree));
  }, [collectDocPaths]);

  /** Open a document by reading it from disk */
  const openDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path: string,
  ) => {
    try {
      const parts = path.split("/");
      let dirHandle = rootHandle;
      for (const part of parts.slice(0, -1)) {
        dirHandle = await dirHandle.getDirectoryHandle(part);
      }
      const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
      const content = await readTextFile(fileHandle);
      setActiveDocPath(path);
      setActiveDocContent(content);
      setDocDirty(false);
      return content;
    } catch {
      setActiveDocPath(path);
      setActiveDocContent("");
      setDocDirty(false);
      return "";
    }
  }, []);

  /** Save the active document to disk */
  const saveDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path?: string,
    content?: string,
  ) => {
    const savePath = path ?? activeDocPath;
    const saveContent = content ?? activeDocContent;
    if (!savePath) return;
    await writeTextFile(rootHandle, savePath, saveContent);
    setDocDirty(false);
  }, [activeDocPath, activeDocContent]);

  /** Create a new document */
  const createDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path: string,
    initialContent = "",
  ) => {
    await writeTextFile(rootHandle, path, initialContent);
    setActiveDocPath(path);
    setActiveDocContent(initialContent);
    setDocDirty(false);
    return path;
  }, []);

  /** Update content in memory (mark dirty) */
  const updateContent = useCallback((markdown: string) => {
    setActiveDocContent(markdown);
    setDocDirty(true);
  }, []);

  /** Attach a document to an entity */
  const attachDocument = useCallback((
    docPath: string,
    entityType: DocumentMeta["attachedTo"] extends (infer T)[] | undefined ? T extends { type: infer U } ? U : never : never,
    entityId: string,
  ) => {
    setDocuments(prev => {
      const existing = prev.find(d => d.filename === docPath);
      if (existing) {
        const already = existing.attachedTo?.some(
          a => a.type === entityType && a.id === entityId
        );
        if (already) return prev;
        return prev.map(d =>
          d.filename === docPath
            ? { ...d, attachedTo: [...(d.attachedTo ?? []), { type: entityType, id: entityId }] }
            : d
        );
      }
      // Create new DocumentMeta entry
      const title = docPath.split("/").pop()?.replace(".md", "") ?? docPath;
      const newDoc: DocumentMeta = {
        id: `doc-${Date.now()}`,
        filename: docPath,
        title,
        attachedTo: [{ type: entityType, id: entityId }],
      };
      return [...prev, newDoc];
    });
  }, []);

  /** Detach a document from an entity */
  const detachDocument = useCallback((
    docPath: string,
    entityType: string,
    entityId: string,
  ) => {
    setDocuments(prev =>
      prev.map(d => {
        if (d.filename !== docPath) return d;
        return {
          ...d,
          attachedTo: d.attachedTo?.filter(
            a => !(a.type === entityType && a.id === entityId)
          ),
        };
      }).filter(d => (d.attachedTo?.length ?? 0) > 0 || d.filename === activeDocPath)
    );
  }, [activeDocPath]);

  /** Get documents attached to an entity */
  const getDocumentsForEntity = useCallback((
    entityType: string,
    entityId: string,
  ): DocumentMeta[] => {
    return documents.filter(d =>
      d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
    );
  }, [documents]);

  /** Check if an entity has attached documents */
  const hasDocuments = useCallback((
    entityType: string,
    entityId: string,
  ): boolean => {
    return documents.some(d =>
      d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
    );
  }, [documents]);

  return {
    documents,
    setDocuments,
    activeDocPath,
    activeDocContent,
    docDirty,
    openDocument,
    saveDocument,
    createDocument,
    updateContent,
    setActiveDocPath,
    attachDocument,
    detachDocument,
    getDocumentsForEntity,
    hasDocuments,
    collectDocPaths,
    existingDocPaths,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/architecture_designer/hooks/useDocuments.ts
git commit -m "feat: add useDocuments hook for document state management"
```

---

## Task 10: Properties Panel Documents Section

**Files:**
- Create: `src/app/architecture_designer/components/properties/DocumentsSection.tsx`
- Modify: `src/app/architecture_designer/components/properties/NodeProperties.tsx`
- Modify: `src/app/architecture_designer/components/properties/LineProperties.tsx`
- Modify: `src/app/architecture_designer/components/properties/LayerProperties.tsx`
- Modify: `src/app/architecture_designer/components/properties/ArchitectureProperties.tsx`
- Modify: `src/app/architecture_designer/components/properties/PropertiesPanel.tsx`

- [ ] **Step 1: Create DocumentsSection component**

```typescript
// src/app/architecture_designer/components/properties/DocumentsSection.tsx
"use client";

import React from "react";
import { FileText, X, Plus } from "lucide-react";
import type { DocumentMeta } from "../../utils/types";
import { Section } from "./shared";

interface DocumentsSectionProps {
  entityType: string;
  entityId: string;
  documents: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: () => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
}

export default function DocumentsSection({
  entityType,
  entityId,
  documents,
  onOpenDocument,
  onAttachDocument,
  onDetachDocument,
}: DocumentsSectionProps) {
  const attached = documents.filter(d =>
    d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
  );

  return (
    <Section title={`Documents${attached.length > 0 ? ` (${attached.length})` : ""}`}>
      {attached.length > 0 ? (
        <div className="flex flex-col gap-1">
          {attached.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-xs group"
            >
              <FileText size={12} className="text-emerald-500 flex-shrink-0" />
              <button
                onClick={() => onOpenDocument?.(doc.filename)}
                className="text-blue-600 hover:underline truncate flex-1 text-left"
              >
                {doc.filename.split("/").pop()}
              </button>
              <button
                onClick={() => onDetachDocument?.(doc.filename, entityType, entityId)}
                className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Detach document"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">No documents attached</p>
      )}
      <button
        onClick={onAttachDocument}
        className="mt-1.5 w-full text-[11px] text-blue-500 border border-dashed border-blue-300 rounded px-2 py-1 hover:bg-blue-50 flex items-center justify-center gap-1"
      >
        <Plus size={10} /> Attach document
      </button>
    </Section>
  );
}
```

- [ ] **Step 2: Add DocumentsSection to property panels**

In each of `NodeProperties.tsx`, `LineProperties.tsx`, `LayerProperties.tsx`, and `ArchitectureProperties.tsx`:

1. Add props for document data:

```typescript
// Add to each component's props:
  documents?: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
```

2. Add `<DocumentsSection />` at the bottom of each component's JSX, passing the appropriate `entityType` and `entityId`:

For `NodeProperties`: `entityType="node"`, `entityId={node.id}`
For `LineProperties`: `entityType="connection"`, `entityId={connection.id}`
For `LayerProperties`: `entityType="layer"`, `entityId={layerDef.id}` (Note: layers aren't in the spec's attachment types, so this is for the `layer` type entity — which maps to a layer)
For `ArchitectureProperties`: `entityType="root"`, `entityId="root"` for the diagram itself; also add ⓘ indicators next to flow and type list items

- [ ] **Step 3: Thread document props through PropertiesPanel**

Add document-related props to `PropertiesPanelProps` and pass them down:

```typescript
// Add to PropertiesPanelProps:
  documents?: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
```

Pass to each sub-panel in the selection switch.

- [ ] **Step 4: Commit**

```bash
git add src/app/architecture_designer/components/properties/
git commit -m "feat: add DocumentsSection to all property panels"
```

---

## Task 11: ⓘ Document Indicators on Canvas

**Files:**
- Create: `src/app/architecture_designer/components/DocInfoBadge.tsx`
- Modify: `src/app/architecture_designer/components/Element.tsx`
- Modify: `src/app/architecture_designer/components/ConditionElement.tsx`
- Modify: `src/app/architecture_designer/components/DataLine.tsx`

- [ ] **Step 1: Create DocInfoBadge component**

```typescript
// src/app/architecture_designer/components/DocInfoBadge.tsx
"use client";

import React, { useState } from "react";

interface DocInfoBadgeProps {
  color: string;                    // entity's border/line color
  position: { x: number; y: number }; // absolute position relative to parent
  documentPaths: string[];          // attached document filenames
  onNavigate: (path: string) => void;
}

export default function DocInfoBadge({ color, position, documentPaths, onNavigate }: DocInfoBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  if (documentPaths.length === 0) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (documentPaths.length === 1) {
      onNavigate(documentPaths[0]);
    } else {
      setShowDropdown(!showDropdown);
    }
  };

  return (
    <div
      style={{ position: "absolute", left: position.x, top: position.y, zIndex: 20 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        onClick={handleClick}
        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-pointer shadow-sm border-2 border-white hover:scale-110 transition-transform"
        style={{ backgroundColor: color }}
        title={documentPaths.length === 1 ? `Open ${documentPaths[0]}` : `${documentPaths.length} documents`}
      >
        i
      </div>
      {showDropdown && documentPaths.length > 1 && (
        <div className="absolute top-6 left-0 bg-white rounded shadow-lg border border-slate-200 py-1 min-w-[140px] z-30">
          {documentPaths.map(path => (
            <button
              key={path}
              onClick={(e) => { e.stopPropagation(); onNavigate(path); setShowDropdown(false); }}
              className="block w-full text-left px-3 py-1 text-xs hover:bg-blue-50 text-blue-600 truncate"
            >
              {path.split("/").pop()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add DocInfoBadge to Element.tsx**

Add new props to `ElementProps`:

```typescript
  hasDocuments?: boolean;
  documentPaths?: string[];
  onDocNavigate?: (path: string) => void;
```

In the JSX, after the element's main container, add (only visible on hover):

```typescript
{isHovered && hasDocuments && documentPaths && onDocNavigate && (
  <DocInfoBadge
    color={borderColor ?? "#3b82f6"}
    position={{ x: width - 4, y: -8 }}
    documentPaths={documentPaths}
    onNavigate={onDocNavigate}
  />
)}
```

- [ ] **Step 3: Add DocInfoBadge to ConditionElement.tsx**

Same pattern — add `hasDocuments`, `documentPaths`, `onDocNavigate` props. Position the badge at the top-right of the diamond bounding box:

```typescript
{isHovered && hasDocuments && documentPaths && onDocNavigate && (
  <DocInfoBadge
    color={borderColor ?? "#a855f7"}
    position={{ x: width - 4, y: -8 }}
    documentPaths={documentPaths}
    onNavigate={onDocNavigate}
  />
)}
```

- [ ] **Step 4: Add DocInfoBadge to DataLine.tsx**

Add `hasDocuments`, `documentPaths`, `onDocNavigate` to `DataLineProps`. Position the badge next to the label. In the label rendering section, add:

```typescript
{isHovered && hasDocuments && documentPaths && onDocNavigate && label && (
  <DocInfoBadge
    color={color}
    position={{ x: labelX + labelWidth + 4, y: labelY - 10 }}
    documentPaths={documentPaths}
    onNavigate={onDocNavigate}
  />
)}
```

(Exact position values will need adjustment based on the label element's actual rendered position.)

- [ ] **Step 5: Commit**

```bash
git add src/app/architecture_designer/components/DocInfoBadge.tsx src/app/architecture_designer/components/Element.tsx src/app/architecture_designer/components/ConditionElement.tsx src/app/architecture_designer/components/DataLine.tsx
git commit -m "feat: add ⓘ document indicator badges on canvas elements"
```

---

## Task 12: Document Picker Modal

**Files:**
- Create: `src/app/architecture_designer/components/DocumentPicker.tsx`

- [ ] **Step 1: Create DocumentPicker**

```typescript
// src/app/architecture_designer/components/DocumentPicker.tsx
"use client";

import React, { useState, useMemo } from "react";
import { FileText, Plus, X, Search } from "lucide-react";

interface DocumentPickerProps {
  allDocPaths: string[];
  attachedPaths: string[];        // already attached to this entity
  onAttach: (path: string) => void;
  onCreate: (path: string) => void;
  onClose: () => void;
}

export default function DocumentPicker({
  allDocPaths,
  attachedPaths,
  onAttach,
  onCreate,
  onClose,
}: DocumentPickerProps) {
  const [search, setSearch] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const attachedSet = useMemo(() => new Set(attachedPaths), [attachedPaths]);

  const filtered = useMemo(() => {
    if (!search) return allDocPaths.filter(p => !attachedSet.has(p));
    const lower = search.toLowerCase();
    return allDocPaths.filter(p => !attachedSet.has(p) && p.toLowerCase().includes(lower));
  }, [allDocPaths, attachedSet, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-80 max-h-96 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800">Attach Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded border border-slate-200">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="flex-1 text-xs bg-transparent outline-none"
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-auto px-2 py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No documents found</p>
          )}
          {filtered.map(path => (
            <button
              key={path}
              onClick={() => { onAttach(path); onClose(); }}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 text-xs"
            >
              <FileText size={12} className="text-emerald-500" />
              <span className="text-slate-700 truncate">{path}</span>
            </button>
          ))}
        </div>

        {/* Create new */}
        <div className="px-4 py-2 border-t border-slate-200">
          {showCreate ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newDocName}
                onChange={e => setNewDocName(e.target.value)}
                placeholder="docs/new-document.md"
                className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded outline-none focus:border-blue-400"
                onKeyDown={e => {
                  if (e.key === "Enter" && newDocName.trim()) {
                    const path = newDocName.endsWith(".md") ? newDocName : `${newDocName}.md`;
                    onCreate(path);
                    onClose();
                  }
                  if (e.key === "Escape") setShowCreate(false);
                }}
              />
              <button
                onClick={() => {
                  if (newDocName.trim()) {
                    const path = newDocName.endsWith(".md") ? newDocName : `${newDocName}.md`;
                    onCreate(path);
                    onClose();
                  }
                }}
                className="text-xs px-2 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700"
            >
              <Plus size={12} /> Create new document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/architecture_designer/components/DocumentPicker.tsx
git commit -m "feat: add DocumentPicker modal for attaching documents to entities"
```

---

## Task 13: Integration & Wiring

**Files:**
- Modify: `src/app/architecture_designer/architectureDesigner.tsx`

This is the final integration task that wires all the new hooks and components together in the main component.

- [ ] **Step 1: Import and initialize hooks**

Add imports:

```typescript
import { useDocuments } from "./hooks/useDocuments";
import { useLinkIndex } from "./hooks/useLinkIndex";
import SplitPane from "./components/SplitPane";
import MarkdownPane from "./components/MarkdownPane";
import DocumentPicker from "./components/DocumentPicker";
import type { ViewMode, ExplorerFilter, DocumentMeta } from "./utils/types";
```

Initialize hooks inside the component:

```typescript
const {
  documents, setDocuments, activeDocPath, activeDocContent, docDirty,
  openDocument, saveDocument, createDocument, updateContent, setActiveDocPath,
  attachDocument, detachDocument, getDocumentsForEntity, hasDocuments,
  collectDocPaths, existingDocPaths,
} = useDocuments();

const {
  linkIndex, loadIndex, updateDocumentLinks, removeDocumentFromIndex,
  renameDocumentInIndex, getBacklinksFor, fullRebuild,
} = useLinkIndex();
```

- [ ] **Step 2: Wire document opening to Explorer and ⓘ badges**

Create a handler for opening documents that loads content from disk:

```typescript
const handleOpenDocument = useCallback(async (path: string) => {
  if (docDirty && activeDocPath && dirHandle) {
    await saveDocument(dirHandle, activeDocPath, activeDocContent);
  }
  if (dirHandle) {
    await openDocument(dirHandle, path);
  }
  if (viewMode === "diagram") setViewMode("split");
}, [docDirty, activeDocPath, dirHandle, saveDocument, activeDocContent, openDocument, viewMode]);
```

Pass `handleOpenDocument` to:
- `ExplorerPanel` as `onSelectDocument`
- All property panel `DocumentsSection` components as `onOpenDocument`
- All `Element`, `ConditionElement`, `DataLine` components as `onDocNavigate`

- [ ] **Step 3: Wire document saving**

Auto-save on document switch and on explicit save (Cmd+S):

```typescript
// In the keyboard shortcuts handler, add:
if ((e.metaKey || e.ctrlKey) && e.key === "s" && viewMode !== "diagram") {
  e.preventDefault();
  if (activeDocPath && dirHandle) {
    saveDocument(dirHandle, activeDocPath, activeDocContent);
    // Update link index after save
    updateDocumentLinks(dirHandle, activeDocPath, activeDocContent);
  }
}
```

- [ ] **Step 4: Wire split mode auto-sync**

When a node/element is selected in the canvas, auto-navigate to its attached document:

```typescript
// After selection change handler:
useEffect(() => {
  if (viewMode === "split" && selection?.type === "node" && dirHandle) {
    const docs = getDocumentsForEntity("node", selection.id);
    if (docs.length > 0) {
      openDocument(dirHandle, docs[0].filename);
    }
  }
}, [selection, viewMode, dirHandle, getDocumentsForEntity, openDocument]);
```

- [ ] **Step 5: Wire DocumentPicker**

Add state for the picker modal:

```typescript
const [pickerTarget, setPickerTarget] = useState<{ type: string; id: string } | null>(null);
```

Handler for attaching:

```typescript
const handleAttachDocument = useCallback((entityType: string, entityId: string) => {
  setPickerTarget({ type: entityType, id: entityId });
}, []);
```

Render the picker when `pickerTarget` is set:

```typescript
{pickerTarget && (
  <DocumentPicker
    allDocPaths={collectDocPaths(tree)}
    attachedPaths={getDocumentsForEntity(pickerTarget.type, pickerTarget.id).map(d => d.filename)}
    onAttach={(path) => {
      attachDocument(path, pickerTarget.type as any, pickerTarget.id);
    }}
    onCreate={async (path) => {
      if (dirHandle) {
        await createDocument(dirHandle, path);
        attachDocument(path, pickerTarget.type as any, pickerTarget.id);
      }
    }}
    onClose={() => setPickerTarget(null)}
  />
)}
```

- [ ] **Step 6: Wire documents into diagram save/load**

When saving a diagram, include `documents` in the data:

```typescript
// In the save handler, add documents to the DiagramData:
documents: documents,
```

When loading a diagram, restore documents:

```typescript
// In the load handler:
if (data.documents) setDocuments(data.documents);
```

- [ ] **Step 7: Pass hasDocuments and documentPaths to canvas elements**

For each `Element`, `ConditionElement`, and `DataLine` rendered in the canvas, compute and pass the document props:

```typescript
// For Element/ConditionElement:
hasDocuments={hasDocuments("node", node.id)}
documentPaths={getDocumentsForEntity("node", node.id).map(d => d.filename)}
onDocNavigate={handleOpenDocument}

// For DataLine:
hasDocuments={hasDocuments("connection", connection.id)}
documentPaths={getDocumentsForEntity("connection", connection.id).map(d => d.filename)}
onDocNavigate={handleOpenDocument}
```

- [ ] **Step 8: Load link index and check vault on directory open**

When a directory is opened, check for vault config and load the link index:

```typescript
// After directory is opened and tree is scanned:
useEffect(() => {
  if (!dirHandle) return;
  (async () => {
    const config = await readVaultConfig(dirHandle);
    if (!config) {
      // First time — initialize vault
      await initVault(dirHandle, title || "Untitled Vault");
    } else {
      await updateVaultLastOpened(dirHandle);
    }
    await loadIndex(dirHandle);
    // Rebuild link index if _links.json is missing (loadIndex returns empty)
    const docPaths = collectDocPaths(tree);
    if (docPaths.length > 0 && Object.keys(linkIndex.documents).length === 0) {
      await fullRebuild(dirHandle, docPaths);
    }
  })();
}, [dirHandle]);
```

Import vault config utilities at the top:

```typescript
import { readVaultConfig, initVault, updateVaultLastOpened } from "./utils/vaultConfig";
```

- [ ] **Step 9: Verify everything works end-to-end**

```bash
npm run dev
```

Test the full flow:
1. Open a vault directory
2. Create a `.md` file via Explorer
3. Edit it in Document mode (WYSIWYG and raw)
4. Attach it to an element via Properties panel
5. Hover the element → see ⓘ badge
6. Click ⓘ → navigate to document in Split mode
7. Add `[[other-doc]]` wiki-link → verify chip renders
8. Switch between all three viewport modes
9. Save (Cmd+S) → verify file written to disk

- [ ] **Step 10: Commit**

```bash
git add src/app/architecture_designer/architectureDesigner.tsx
git commit -m "feat: wire markdown documents system into main component"
```

---

## Task 14: Link Maintenance on File Operations

**Files:**
- Modify: `src/app/architecture_designer/hooks/useFileExplorer.ts`
- Modify: `src/app/architecture_designer/architectureDesigner.tsx`

- [ ] **Step 1: Hook into rename/move operations**

In `architectureDesigner.tsx`, wrap the existing `onRenameFile` handler from `useFileExplorer` to also update wiki-links:

```typescript
const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
  // Call existing rename
  onRenameFile(oldPath, newName);

  if (!oldPath.endsWith(".md") || !dirHandle) return;

  const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
  const newPath = dir ? `${dir}/${newName}` : newName;

  // Update link index
  await renameDocumentInIndex(dirHandle, oldPath, newPath);

  // Update wiki-links in all documents that reference the old path
  const backlinks = getBacklinksFor(oldPath);
  for (const bl of backlinks) {
    try {
      const parts = bl.sourcePath.split("/");
      let dh = dirHandle;
      for (const part of parts.slice(0, -1)) dh = await dh.getDirectoryHandle(part);
      const fh = await dh.getFileHandle(parts[parts.length - 1]);
      const content = await readTextFile(fh);
      const updated = updateWikiLinkPaths(content, oldPath, newPath);
      if (updated !== content) {
        await writeTextFile(dirHandle, bl.sourcePath, updated);
      }
    } catch { /* skip files that can't be read */ }
  }
}, [onRenameFile, dirHandle, renameDocumentInIndex, getBacklinksFor]);
```

- [ ] **Step 2: Hook into delete operations**

Similarly wrap `onDeleteFile` to remove from the link index (links become broken):

```typescript
const handleDeleteFile = useCallback(async (path: string, event: React.MouseEvent) => {
  onDeleteFile(path, event);
  if (path.endsWith(".md") && dirHandle) {
    await removeDocumentFromIndex(dirHandle, path);
  }
}, [onDeleteFile, dirHandle, removeDocumentFromIndex]);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/architecture_designer/architectureDesigner.tsx
git commit -m "feat: auto-update wiki-links on file rename/move/delete"
```

---

## Verification

After all tasks are complete, run through the spec's verification plan (§10):

1. **Vault**: Open a directory → verify Explorer shows both `.json` and `.md` files
2. **Viewport**: Toggle Diagram/Split/Document → verify layout switches correctly
3. **Editor**: Create `.md` file → edit in WYSIWYG → switch to raw → switch back → save → verify file on disk
4. **Wiki-Links**: Type `[[` → insert link → verify chip renders → click navigates → rename linked doc → verify links updated
5. **ⓘ Indicators**: Attach doc to element → hover → verify badge appears → click → verify navigation
6. **Properties**: Select element → verify Documents section shows attached docs → attach/detach
7. **Build**: `npm run build` passes with no errors

```bash
npm run build
```
