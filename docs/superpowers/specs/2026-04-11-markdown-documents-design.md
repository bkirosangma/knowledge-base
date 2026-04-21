# Markdown Documents — Design Spec

## Context

The architecture-designer app currently supports visual diagram editing with elements, connections, flows, layers, and types. All data is stored in localStorage as JSON. There is no way to attach documentation, notes, or rich text to diagram entities.

This feature adds a **Knowledge Vault** system — an Obsidian-inspired document management layer where markdown documents live alongside diagrams on disk. Documents can be attached to any diagram entity, linked to each other via wiki-links, and viewed/edited in a full Tiptap-based WYSIWYG editor with raw markdown mode.

**Phasing:** This spec covers **Phase 1** (core vault, editor, linking, viewport). Phase 2 (full-text search, templates, graph view, graphify integration) is noted at the end but not specified here.

---

## 1. Knowledge Vault

### 1.1 Concept

A "Knowledge Vault" is a folder on disk that serves as the project root for all diagrams and documents. Similar to Obsidian's vault model.

### 1.2 Vault Structure

```
my-project/                        ← vault root
├── .archdesigner/                 ← hidden config folder
│   ├── config.json                ← vault settings
│   └── _links.json                ← backlink index (see §5)
├── diagrams/
│   ├── spring-security.json
│   └── auth-flow.json
├── docs/
│   ├── overview.md
│   └── auth/
│       └── jwt-validation.md
└── ...                            ← user-created folders
```

### 1.3 Vault Config (`.archdesigner/config.json`)

```json
{
  "version": "1.0",
  "name": "Spring Security Architecture",
  "created": "2026-04-11T12:00:00Z",
  "lastOpened": "2026-04-11T18:00:00Z"
}
```

### 1.4 Vault Lifecycle

| Action | Behavior |
|--------|----------|
| **Create** | User picks/creates a folder → app creates `.archdesigner/` + config |
| **Open** | User picks a folder containing `.archdesigner/config.json` |
| **Switch** | Recent vaults list on a landing/home screen |
| **First launch** | Shows "Initialize Vault" screen if no vault path in localStorage |

### 1.5 Persistence Migration

| What | Before | After |
|------|--------|-------|
| Diagram JSON | localStorage | `.json` files on disk in vault |
| Document content | N/A (new) | `.md` files on disk in vault |
| Link index | N/A (new) | `.archdesigner/_links.json` |
| UI preferences | localStorage | localStorage (stays) |
| Autosave drafts | localStorage | localStorage (buffer before explicit save) |
| Last vault path | N/A | localStorage |
| Recent vaults | N/A | localStorage |

---

## 2. Viewport Modes

### 2.1 Three Modes

A new `viewMode` state: `'diagram' | 'split' | 'document'`

**Header control:** Segmented toggle (`📐 Diagram | ⬜ Split | 📄 Document`) placed after the diagram title, before the existing Live/Labels toggles.

### 2.2 Layout per Mode

| Mode | Left sidebar | Center | Right sidebar |
|------|-------------|--------|--------------|
| **Diagram** | Explorer + History (current behavior) | Canvas | Properties |
| **Split** | Explorer + History | Canvas (left) \| Markdown (right), resizable divider | Properties |
| **Document** | Explorer + History | Markdown editor/viewer (full width) | Properties |

### 2.3 Mode-Specific Behavior

**Diagram mode:** Current behavior. No changes except the new segmented toggle in the header. Diagram-specific header controls (Live, Labels, Zoom, Auto-Arrange) fully active.

**Split mode:**
- Resizable divider between canvas and markdown pane
- Default split ratio: 50/50, persisted in localStorage
- **Auto-sync:** Clicking an element in the diagram navigates the markdown pane to its attached document (if one exists)
- Diagram controls remain active for the canvas pane

**Document mode:**
- Markdown editor/viewer fills the center pane
- Editor toolbar at top with WYSIWYG/raw toggle, document title, backlinks indicator
- Diagram-specific header controls (Live, Labels, Zoom, Auto-Arrange) hidden or disabled
- Breadcrumb: `Document > folder > doc-name.md`

### 2.4 Explorer in All Modes

The Explorer panel is consistent across all three modes — same tree-style file browser showing the vault's real directory structure (folders and files). Filter toggles control visibility:

- `📐 Diagrams` — show only `.json` diagram files
- `📄 Documents` — show only `.md` files
- `All` — show everything

Clicking a `.md` file opens it in the markdown viewer/editor. Clicking a `.json` file opens it as a diagram.

---

## 3. Markdown Editor (Tiptap)

### 3.1 Library

**Tiptap** (ProseMirror-based) for the WYSIWYG editor. Key packages:
- `@tiptap/react` — React integration
- `@tiptap/starter-kit` — base extensions (headings, bold, italic, lists, code blocks, blockquotes, etc.)
- `@tiptap/extension-table` — GFM tables
- `@tiptap/extension-task-list` + `@tiptap/extension-task-item` — task lists
- `@tiptap/extension-link` — standard links
- `@tiptap/extension-placeholder` — placeholder text
- Custom extension for wiki-links (see §4)

### 3.2 Two Editor Sub-Modes

**WYSIWYG mode** (default):
- Rich text editing with formatted output
- Floating toolbar on text selection: bold, italic, heading, link, code, strikethrough
- Wiki-links render as clickable inline chips
- Tables, task lists, code blocks render visually

**Raw mode:**
- Plain text editing showing raw markdown source
- Toggle via button in the editor toolbar
- Content round-trips cleanly between WYSIWYG ↔ raw (Tiptap serializes to/from markdown)

### 3.3 Editor Toolbar

Located at the top of the markdown pane:
- **WYSIWYG / Raw toggle** — switches editor sub-mode
- **Document title** — editable, updates the filename
- **Backlinks indicator** — "N references" badge; click to expand a list of documents that link to this one

### 3.4 GFM Features (v1)

Headings (h1–h6), bold, italic, strikethrough, ordered lists, unordered lists, task lists, tables, code blocks (with language hint), blockquotes, horizontal rules, images (via URL), standard links.

---

## 4. Wiki-Links

### 4.1 Syntax

| Pattern | Meaning |
|---------|---------|
| `[[doc-name]]` | Link to file in same directory |
| `[[subfolder/doc-name]]` | Relative path link |
| `[[/absolute/path/doc-name]]` | Absolute path from vault root |
| `[[doc-name#section]]` | Link to specific heading in a document |
| `[[subfolder/doc-name#section]]` | Relative path + section anchor |

File extensions (`.md`) are optional in the link syntax.

### 4.2 Editor Behavior

- Typing `[[` triggers an autocomplete dropdown listing all documents in the vault
- Autocomplete searches by filename and path
- Completed wiki-links render as styled inline chips (WYSIWYG mode) or highlighted syntax (raw mode)
- Clicking a wiki-link navigates to the target document
- **Broken links** (target doesn't exist) render in red with a "Create document" action on click

### 4.3 Backlink Awareness

Each document's editor toolbar shows a backlinks count. Expanding it lists all documents that reference the current document (with the specific section if applicable). Clicking a backlink navigates to the referencing document.

### 4.4 Automatic Link Maintenance

When a file operation changes a document's path, all wiki-links referencing it are updated:

| File operation | Link behavior |
|----------------|---------------|
| **Rename** | All `[[old-name]]` → `[[new-name]]` across vault |
| **Move** | All `[[old/path/name]]` → `[[new/path/name]]` across vault |
| **Delete** | Affected links marked as broken (not removed — user decides) |

**Implementation:** API routes for rename/move/delete:
1. Query `_links.json` to find all documents that link to the affected file
2. Read each linking document, find and update `[[...]]` references
3. Write updated content back to disk
4. Rebuild affected entries in the link index

---

## 5. Persisted Link Index

### 5.1 Purpose

Avoids re-parsing all documents on every page load to compute backlinks. Stored at `.archdesigner/_links.json`.

### 5.2 Structure

```typescript
interface LinkIndex {
  updatedAt: string;
  documents: Record<string, {           // keyed by relative file path
    outboundLinks: string[];            // target file paths
    sectionLinks: {
      targetPath: string;
      section: string;
    }[];
  }>;
  backlinks: Record<string, {           // keyed by target file path
    linkedFrom: {
      sourcePath: string;
      section?: string;                 // section in source that contains the link
    }[];
  }>;
}
```

### 5.3 Update Strategy

- **On document save:** Re-parse only the saved document's `[[...]]` links. Remove old entries for that doc, add new ones, rebuild affected backlinks. O(n) where n = links in the changed document.
- **On file rename/move/delete:** Update paths in all affected entries.
- **Full rebuild:** Available via API (`POST /api/links/rebuild`). Runs if `_links.json` is missing or corrupted. O(total links across all documents).

---

## 6. ⓘ Document Indicators

### 6.1 Canvas Indicators

On hover over an entity that has attached documents, a small circular ⓘ badge appears:

| Entity type | Badge position |
|-------------|---------------|
| **Element** (rect) | Top-right corner |
| **Condition** (diamond) | Top-right of diamond |
| **Connection** | Next to the connection label |

- Badge color matches the entity's border/line color
- Badge has a white border ring for contrast against any background
- Click behavior:
  - **Single document attached:** Navigates directly to that document, switching to Split mode (so diagram stays visible)
  - **Multiple documents attached:** Shows a small dropdown listing the attached docs; clicking one navigates to it
  - If already in Split or Document mode, stays in that mode
- Root diagram: No canvas indicator (accessible only via properties panel)

### 6.2 Properties Panel Indicators

For **all entity types** (including flows and types that have no canvas representation):

| Entity type | Where ⓘ appears |
|-------------|-----------------|
| **Element** | NodeProperties panel |
| **Connection** | LineProperties panel |
| **Layer** | LayerProperties panel |
| **Flow** | ArchitectureProperties flow list |
| **Type** | ArchitectureProperties type list |
| **Root diagram** | ArchitectureProperties header |

---

## 7. Properties Panel: Documents Section

### 7.1 New Section

Each property sub-panel (NodeProperties, LineProperties, LayerProperties, ArchitectureProperties) gains a **"Documents"** section:

- Shows a count badge (e.g., "📄 Documents `2`")
- Lists attached document filenames as clickable links
- Click a filename → navigates to that document in the editor
- **"+ Attach document"** button → opens a picker listing all vault documents, or creates a new one
- **Detach** action on each listed document (removes the association, not the file)

### 7.2 Attachment Model

Document-to-entity links are stored in the `DocumentMeta.attachedTo` array (in the diagram JSON's `documents` field). A document can be attached to multiple entities. An entity can have multiple attached documents.

```typescript
interface DocumentMeta {
  id: string;
  filename: string;       // relative path from vault root
  title: string;
  attachedTo?: {
    type: 'root' | 'node' | 'connection' | 'flow' | 'type';
    id: string;
  }[];
}
```

The `documents` array lives in `DiagramData`:

```typescript
interface DiagramData {
  // ... existing fields
  documents?: DocumentMeta[];
}
```

---

## 8. Next.js API Routes

### 8.1 Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/vault/init` | POST | Initialize a new vault at a given path |
| `/api/vault/open` | POST | Open an existing vault, return config |
| `/api/vault/tree` | GET | Return full file tree of the vault |
| `/api/docs/[...path]` | GET | Read a document's content |
| `/api/docs/[...path]` | PUT | Create or update a document |
| `/api/docs/[...path]` | DELETE | Delete a document + mark backlinks as broken |
| `/api/docs/move` | POST | Move/rename a document + update all backlinks |
| `/api/diagrams/[...path]` | GET | Read a diagram JSON |
| `/api/diagrams/[...path]` | PUT | Save a diagram JSON |
| `/api/diagrams/[...path]` | DELETE | Delete a diagram |
| `/api/links` | GET | Read `_links.json` |
| `/api/links/rebuild` | POST | Force full rebuild of `_links.json` |

### 8.2 Vault Path

The active vault path is stored in localStorage and sent as a header (`X-Vault-Path`) or query parameter with each API request. API routes resolve all file operations relative to this vault root.

### 8.3 Security

- API routes validate that all file paths resolve within the vault root (prevent path traversal)
- Only `.md` and `.json` files can be read/written via the document/diagram endpoints
- The `.archdesigner/` folder is only accessible via dedicated vault endpoints

---

## 9. Key Files to Modify

| File | Changes |
|------|---------|
| `src/app/architecture_designer/architectureDesigner.tsx` | Add `viewMode` state, viewport mode switching, pass document props |
| `src/app/architecture_designer/components/Header.tsx` | Add segmented mode toggle (Diagram \| Split \| Document) |
| `src/app/architecture_designer/components/ExplorerPanel.tsx` | Add file type filter toggles, handle `.md` file clicks |
| `src/app/architecture_designer/components/properties/PropertiesPanel.tsx` | Pass document props to sub-panels |
| `src/app/architecture_designer/components/properties/NodeProperties.tsx` | Add Documents section |
| `src/app/architecture_designer/components/properties/LineProperties.tsx` | Add Documents section |
| `src/app/architecture_designer/components/properties/LayerProperties.tsx` | Add Documents section |
| `src/app/architecture_designer/components/properties/ArchitectureProperties.tsx` | Add Documents section for root, flows, types |
| `src/app/architecture_designer/components/properties/shared.tsx` | Add reusable `DocumentsSection` component |
| `src/app/architecture_designer/components/Element.tsx` | Add ⓘ badge rendering on hover |
| `src/app/architecture_designer/components/ConditionElement.tsx` | Add ⓘ badge rendering on hover |
| `src/app/architecture_designer/components/DataLine.tsx` | Add ⓘ badge rendering near label on hover |
| `src/app/architecture_designer/utils/types.ts` | Add `DocumentMeta`, `LinkIndex`, `ViewMode` types |
| `src/app/architecture_designer/utils/persistence.ts` | Refactor to use API routes instead of localStorage for data |

### New Files

| File | Purpose |
|------|---------|
| `src/app/architecture_designer/components/MarkdownEditor.tsx` | Tiptap editor component (WYSIWYG + raw toggle) |
| `src/app/architecture_designer/components/MarkdownPane.tsx` | Container for editor + toolbar + backlinks |
| `src/app/architecture_designer/components/DocumentPicker.tsx` | Modal for attaching documents to entities |
| `src/app/architecture_designer/components/VaultInit.tsx` | First-run vault initialization screen |
| `src/app/architecture_designer/extensions/wikiLink.ts` | Custom Tiptap extension for `[[wiki-links]]` |
| `src/app/architecture_designer/hooks/useDocuments.ts` | Document state management hook |
| `src/app/architecture_designer/hooks/useVault.ts` | Vault lifecycle hook |
| `src/app/architecture_designer/hooks/useLinkIndex.ts` | Link index management hook |
| `src/app/api/vault/init/route.ts` | Vault initialization API |
| `src/app/api/vault/open/route.ts` | Vault open API |
| `src/app/api/vault/tree/route.ts` | File tree API |
| `src/app/api/docs/[...path]/route.ts` | Document CRUD API |
| `src/app/api/docs/move/route.ts` | Document move/rename API |
| `src/app/api/diagrams/[...path]/route.ts` | Diagram CRUD API |
| `src/app/api/links/route.ts` | Link index read API |
| `src/app/api/links/rebuild/route.ts` | Link index rebuild API |

---

## 10. Verification Plan

### 10.1 Vault

- Initialize a new vault → verify `.archdesigner/config.json` created
- Open an existing vault → verify file tree loads in Explorer
- Switch vaults → verify data isolation

### 10.2 Viewport Modes

- Toggle between Diagram / Split / Document → verify layout changes correctly
- Split mode: resize divider → verify persistence
- Split mode: click element → verify markdown pane shows attached document
- Document mode: verify diagram controls hidden, editor toolbar visible

### 10.3 Editor

- Create new document → verify file created on disk
- Edit in WYSIWYG mode → save → verify `.md` content on disk
- Switch to raw mode → verify markdown source shown
- Edit in raw mode → switch back → verify WYSIWYG renders correctly
- GFM features: tables, task lists, code blocks → verify rendering

### 10.4 Wiki-Links

- Type `[[` → verify autocomplete shows document list
- Insert `[[doc-name]]` → verify renders as chip, click navigates
- Insert `[[subfolder/doc-name#section]]` → verify navigates to correct heading
- Insert link to nonexistent doc → verify renders red, click offers "create"
- Rename a linked document → verify all `[[old-name]]` updated to `[[new-name]]`
- Delete a linked document → verify affected links marked broken

### 10.5 ⓘ Indicators

- Hover element with attached doc → verify ⓘ badge appears
- Hover element without doc → verify no badge
- Click ⓘ → verify navigates to document
- Check ⓘ on: elements, conditions, connection labels

### 10.6 Properties Panel

- Select element with attached doc → verify Documents section shows file
- Click "Attach document" → verify picker opens with vault documents
- Click attached document name → verify navigates to document
- Click detach → verify association removed (file still exists)

---

## Phase 2 (Future)

These features are designed but not implemented in Phase 1:

1. **Full-text search** — Search bar in Explorer, searches across all vault content
2. **Document templates** — ADR, Component Overview, API Docs, Flow Description; save custom templates
3. **Graph view of links** — Force-directed visual graph of document interconnections (Obsidian-style)
4. **Graphify integration** — Use graphify knowledge graph to suggest semantic links between documents
