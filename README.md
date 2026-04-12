# Knowledge Base

A web-based knowledge management tool for creating architectural diagrams and markdown documents with intelligent cross-referencing.

## Features

**Diagram**
- Visual canvas for architectural diagrams with nodes, layers, connections, and condition flows
- Multiple routing algorithms (orthogonal, bezier, straight)
- 50+ icons, auto-arrangement, grid snapping, mini-map, and undo/redo
- Keyboard shortcuts and context menus

**Document Editor**
- WYSIWYG markdown editor powered by Tiptap
- Wiki-link support (`[[document-path]]`) with autocomplete
- Live backlinks and outbound link tracking

**File Explorer**
- Native file system integration via the File System Access API
- Directory tree with drag-and-drop, sorting, and filtering
- Wiki-link-aware rename and delete (automatically updates references)

**Split Pane**
- Side-by-side view for documents and diagrams
- Independent file navigation per pane

## Tech Stack

- **Next.js 16** (App Router) / **React 19** / **TypeScript 5**
- **Tailwind CSS 4**
- **Tiptap 3** (rich text editor with tables, task lists, code blocks, wiki-links)
- **File System Access API** for local vault storage

## Getting Started

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- A browser with File System Access API support (Chrome, Edge, Brave)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Project Structure

```
src/app/knowledge_base/
  features/
    diagram/      # Diagram editor (canvas, nodes, connections, tools)
    document/     # Markdown editor (Tiptap, wiki-links, backlinks)
  shared/
    components/   # Explorer panel, header, split pane, document picker
    hooks/        # File system, undo/redo, file actions
    utils/        # Persistence, graphify bridge, types
  shell/          # Toolbar context, pane manager
  types/          # File System API type declarations
```

## Using with Claude Code

This project includes a Claude Code skill (`/knowledge-base` or `/kb`) for generating diagrams and documents from natural language.

### Sub-commands

| Command | Description |
|---------|-------------|
| `/kb init [path]` | Initialize a new vault with config, memory, and graphify hooks |
| `/kb diagram <topic>` | Generate an architecture diagram (JSON) on any topic |
| `/kb document <topic> [-i]` | Generate a markdown document (`-i` for interactive mode) |
| `/kb create <topic> [-i]` | Generate both a document and diagram, cross-linked via wiki-links |

### Examples

```
/kb init ~/vaults/distributed-systems
/kb diagram "Kubernetes pod lifecycle"
/kb document "Event sourcing patterns" -i
/kb create "Microservices authentication flow"
```

### Compound Intelligence (Optional)

For enhanced content generation, you can set up the compound intelligence layer using [claude-init](https://github.com/bkirosangma/claude-init). This adds three context systems that the skill queries before generating content:

- **graphify** — structural knowledge graph of the vault (related docs, god nodes, communities)
- **claude-mem** — temporal memory from past sessions (decisions, patterns, corrections)
- **MEMORY.md** — curated preferences (archetype styles, icon mappings, topic registry)

With compound intelligence enabled, the skill produces higher-quality output by avoiding duplication, reusing learned preferences, and cross-referencing existing vault content. Each session builds on prior work rather than starting from scratch.

See [setup.md](setup.md) for full setup instructions.
