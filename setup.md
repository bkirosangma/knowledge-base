# Setup Guide

Step-by-step instructions to set up the Knowledge Base project and its Claude Code integration.

## 1. Prerequisites

- **Node.js 22+** (see `.nvmrc`)
- **Claude Code** CLI installed and authenticated
- **Browser** with File System Access API support (Chrome, Edge, Brave)

## 2. Project Setup

```bash
git clone https://github.com/bkirosangma/knowledge-base.git
cd knowledge-base
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 3. Install the Knowledge Base Skill

Copy the skill into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/knowledge-base
cp -r skills/knowledge-base/* ~/.claude/skills/knowledge-base/
```

Add the following to your `~/.claude/CLAUDE.md` so Claude recognizes the trigger:

```markdown
# knowledge-base
- **knowledge-base** (`~/.claude/skills/knowledge-base/SKILL.md`) - unified skill for knowledge-base vaults. Sub-commands: init, diagram, document, create. Trigger: `/knowledge-base` or `/kb`
When the user types `/knowledge-base` or `/kb`, invoke the Skill tool with `skill: "knowledge-base"` before doing anything else.
```

## 4. Initialize a Vault

Open Claude Code in a directory where you want to store your knowledge and run:

```
/kb init
```

This creates:
- `.archdesigner/config.json` — vault metadata
- `.archdesigner/_links.json` — wiki-link backlink index
- `memory/` — archetype preferences and topic registry
- `.graphifyignore` — patterns excluded from indexing

## 5. Optional: Install Graphify

Graphify builds a knowledge graph from your vault content, enabling structural search and cross-reference discovery.

```bash
pip install graphify-ai
```

Once installed, the `/kb init` command automatically installs graphify hooks that rebuild the graph on file changes. You can also rebuild manually:

```bash
/graphify . --update
```

## 6. Optional: Claude-Mem

Claude-mem provides persistent cross-session memory. It runs as an MCP server and is auto-started by Claude Code if the plugin is installed.

Once active, it automatically captures decisions, bug fixes, and architectural choices from your sessions. The knowledge-base skill queries it for relevant past work before generating new content.

## 7. Verify Setup

1. **Dev server**: `npm run dev` should compile without errors and serve at `localhost:3000`
2. **Build**: `npm run build` should complete successfully
3. **Skill**: In Claude Code, type `/kb` — it should display usage help
4. **Vault**: After `/kb init`, confirm `.archdesigner/config.json` exists
5. **Generate content**: Try `/kb create "your topic"` to generate a linked document and diagram
