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
cp -r skills/knowledge-base/. ~/.claude/skills/knowledge-base/
```

Add the following to your `~/.claude/CLAUDE.md` so Claude recognizes the trigger:

```markdown
# knowledge-base
- **knowledge-base** (`~/.claude/skills/knowledge-base/SKILL.md`) — unified skill for knowledge-base vaults. Sub-commands: init, diagram, document, create, edit, validate, transform. Trigger: `/knowledge-base` or `/kb`
When the user types `/knowledge-base` or `/kb`, invoke the Skill tool with `skill: "knowledge-base"` before doing anything else.
```

Restart Claude Code so the new trigger registers. Re-run the `cp` command after every `git pull` to pick up upstream skill changes.

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

## 5. Optional: Compound Intelligence

The knowledge-base skill works on its own, but for enhanced content generation you can set up the compound intelligence layer. This connects three context systems — graphify (structural), claude-mem (temporal), and MEMORY.md (curated) — so the skill produces higher-quality output by avoiding duplication, reusing learned preferences, and cross-referencing existing vault content.

To set it up, follow the instructions at [claude-init](https://github.com/bkirosangma/claude-init).

Once configured, each session builds on prior work: graphify discovers relationships between your documents, claude-mem remembers past decisions and corrections, and MEMORY.md stores your preferred styles and conventions.

## 6. Verify Setup

1. **Dev server**: `npm run dev` should compile without errors and serve at `localhost:3000`
2. **Build**: `npm run build` should complete successfully
3. **Skill**: In Claude Code, type `/kb` — it should display usage help
4. **Vault**: After `/kb init`, confirm `.archdesigner/config.json` exists
5. **Generate content**: Try `/kb create "your topic"` to generate a linked document and diagram
