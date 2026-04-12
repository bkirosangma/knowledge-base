@AGENTS.md

## graphify — Structural Intelligence

This project has a graphify knowledge graph at `graphify-out/`.

### Rules

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- After modifying code files, run: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
- Use `/graphify query "question"` for semantic search across the codebase
- Use `/graphify path "A" "B"` to find how two concepts connect

### When to Rebuild

- After significant code changes (new modules, refactors, API changes)
- After adding new documentation or design docs
- Run `/graphify . --update` for incremental rebuild (only changed files)

### Token Efficiency

- The knowledge graph provides ~70x token reduction vs reading raw files
- Always check `graphify-out/GRAPH_REPORT.md` before doing broad file searches
- Use `/graphify query` instead of grep for conceptual questions

## claude-mem — Temporal Intelligence

This project uses claude-mem for persistent session memory.

### How It Works

- Every session automatically captures tool calls, decisions, bug fixes, and architectural choices
- Observations are compressed and stored in `~/.claude-mem/claude-mem.db`
- Future sessions get relevant context injected automatically

### Rules

- Use `/mem-search <query>` to find relevant work from past sessions
- When making architectural decisions, explain the "why" — claude-mem captures it for future sessions
- When fixing bugs, describe the root cause — it becomes searchable knowledge
- Check past session context before re-solving problems that may have been addressed before

### Available Commands

- `/mem-search "query"` — Search past observations across all sessions
- Memory web viewer: http://localhost:37777

## Compound Intelligence Loop

graphify and claude-mem work together:

1. **graphify** provides STRUCTURAL intelligence — what exists, how things relate, cross-domain connections
2. **claude-mem** provides TEMPORAL intelligence — what was done, why decisions were made, session history
3. **Feedback loop**: claude-mem captures graphify discoveries → future sessions get past graph insights injected → no need to re-query for things already learned
