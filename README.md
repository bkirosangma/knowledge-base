# Knowledge Base

[![CI](https://github.com/bkirosangma/knowledge-base/actions/workflows/ci.yml/badge.svg)](https://github.com/bkirosangma/knowledge-base/actions/workflows/ci.yml)

A local-first knowledge base application with a rich diagram editor and a Markdown document editor. Files are stored on your own filesystem via the File System Access API — no backend, no cloud.

## Features

**Diagram editor**
- Infinite canvas with rectangle and diamond/condition nodes, layers, and directed connections
- Multiple routing algorithms (orthogonal, Bézier, straight)
- 41 Lucide icons, auto-arrangement, grid snapping, collision avoidance, minimap, and undo/redo
- Keyboard shortcuts, context menus, and a full properties panel

**Document editor**
- WYSIWYG Markdown editor powered by Tiptap v3
- Wiki-link support (`[[document-path]]`) with autocomplete
- Live backlinks and outbound link tracking
- Tables, task lists, code blocks with syntax highlighting, and Markdown import/export

**File explorer**
- Native filesystem integration via the File System Access API
- Directory tree with drag-and-drop, sorting, and filtering
- Wiki-link-aware rename and delete (automatically updates all references)

**Split-pane layout**
- Side-by-side view for any combination of documents and diagrams
- Independent file navigation and focus tracking per pane

**Vault system**
- Directory-handle persistence via IndexedDB; survives page reloads
- Per-vault localStorage namespacing so multiple vaults never collide
- Typed error surface — every filesystem failure is classified and surfaced via a shell banner instead of silently discarding data

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Rich text | Tiptap v3 + ProseMirror |
| Icons | Lucide React |
| Persistence | File System Access API + IndexedDB |
| Unit/integration tests | Vitest v4 + Testing Library |
| End-to-end tests | Playwright |
| Language | TypeScript 5 |

## Getting Started

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- A browser with File System Access API support (Chrome, Edge, Brave)

### Installation

```bash
nvm use
npm ci
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

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run lint` | ESLint across `src/` |
| `npm run test:run` | Unit + integration tests (Vitest, single run) |
| `npm run test` | Unit + integration tests (watch mode) |
| `npm run test:ui` | Vitest UI |
| `npm run coverage` | Coverage report |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:e2e:ui` | Playwright UI mode |

## Project Structure

```
src/app/knowledge_base/
├── features/
│   ├── diagram/          # Diagram editor (canvas, nodes, layers, connections, flows)
│   └── document/         # Document editor (Tiptap extensions, hooks, properties)
├── shell/                # App shell (pane manager, contexts, error boundary)
├── domain/               # Repository interfaces + error taxonomy
├── infrastructure/       # File System Access API implementations
└── shared/               # Hooks, components, utils used across features

test-cases/               # Prose test scenarios (source of truth for test scope)
e2e/                      # Playwright specs
```

## CI

Every push and pull request to `main` runs:

1. **Typecheck** — `tsc --noEmit`
2. **Lint** — `eslint src`
3. **Unit + integration tests** — `vitest run`
4. **End-to-end tests** — Playwright (Chromium)
5. **Build** — `next build`

The `main` branch requires a passing CI run, one approving review, and a linear history before merge.

## Documentation

- [`Features.md`](Features.md) — canonical catalogue of every feature and sub-system; must stay in sync with the code.
- [`test-cases/`](test-cases/README.md) — human-readable test scenarios, one file per feature bucket, referenced by ID from test code.

## Using with Claude Code

This project includes a Claude Code skill (`/knowledge-base`) for generating diagrams and documents from natural language.

### Setup

The repo ships the skill source under [`skills/knowledge-base/`](skills/knowledge-base/). Copy it into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/knowledge-base
cp -r skills/knowledge-base/. ~/.claude/skills/knowledge-base/
```

Then add this entry to your `~/.claude/CLAUDE.md` so Claude routes the trigger to the skill:

```markdown
# knowledge-base
- **knowledge-base** (`~/.claude/skills/knowledge-base/SKILL.md`) — unified skill for knowledge-base vaults. Sub-commands: init, diagram, document, create, edit, validate, transform. Trigger: `/knowledge-base` or `/kb`
When the user types `/knowledge-base` or `/kb`, invoke the Skill tool with `skill: "knowledge-base"` before doing anything else.
```

Restart Claude Code so the trigger registers, then run `/kb` in any directory to see the help screen. See [setup.md](setup.md) for the full walkthrough including vault initialization and the optional compound intelligence layer.

To pick up upstream skill changes after `git pull`, re-run the `cp` command above — it overwrites cleanly.

### Sub-commands

| Command | Description |
|---|---|
| `/knowledge-base init [path]` | Initialize a new vault with config, memory, and graphify hooks |
| `/knowledge-base diagram <topic>` | Generate an architecture diagram (JSON) on any topic |
| `/knowledge-base document <topic> [-i]` | Generate a Markdown document (`-i` for interactive mode) |
| `/knowledge-base create <topic> [-i]` | Generate both a document and diagram, cross-linked via wiki-links |
| `/knowledge-base edit <path> [change]` | Edit an existing diagram, enforcing all placement rules |
| `/knowledge-base validate <path> [--fix]` | Validate a diagram or document; `--fix` writes corrections back to disk (original backed up) |
| `/knowledge-base transform <path> [--dry-run] [--add-conventions]` | Bring an existing `.md` or `.json` file into skill-format conformance without changing its content |

### Examples

```
/knowledge-base init ~/vaults/distributed-systems
/knowledge-base diagram "Kubernetes pod lifecycle"
/knowledge-base document "Event sourcing patterns" -i
/knowledge-base create "Microservices authentication flow"
/knowledge-base edit ./auth-flow.json "add OAuth2 token refresh layer"
/knowledge-base validate ./auth-flow.json
/knowledge-base validate ./broken-diagram.json --fix
/knowledge-base transform ./old-doc.md --dry-run
```

### Compound Intelligence (Optional)

For enhanced content generation, set up the compound intelligence layer using [claude-init](https://github.com/bkirosangma/claude-init). This adds three context systems the skill queries before generating content:

| Layer | Tool | Purpose |
|---|---|---|
| Structural | graphify (`graphify-out/`) | What exists, how things relate, god nodes, community structure |
| Temporal | claude-mem | What was done, why decisions were made, session history |
| Curated | `MEMORY.md` | Durable preferences, feedback, project context across sessions |

With compound intelligence enabled, the skill produces higher-quality output by avoiding duplication, reusing learned preferences, and cross-referencing existing vault content. Each session builds on prior work rather than starting from scratch.

See [setup.md](setup.md) for full setup instructions.

### Additional Slash Commands

| Command | Description |
|---|---|
| `/graphify` | Query the structural knowledge graph |
| `/hybrid-search` | Fused search across graphify + claude-mem using RRF |

### Governance Rules (`CLAUDE.md`)

- Every code change that adds, removes, or modifies a feature must update `Features.md` in the same commit.
- Every new feature or sub-feature gets a corresponding test-case entry in `test-cases/` starting at status ❌.
- Test IDs (e.g. `DIAG-3.8-01`) must appear in both the prose spec and the test `it()` description.
- Read `graphify-out/GRAPH_REPORT.md` before broad architecture questions — it provides ~70× token reduction vs. reading raw files.
