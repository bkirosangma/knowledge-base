// Loads docs/superpowers/plans/.mvp4-kb-document-capture.jsonl (or the
// MVP-2 fallback) and yields the ClaudeEvent frames a single `/kb document`
// round-trip would emit. Used by useClaudeSession.kbDocument.test.tsx.
//
// The loader is NOT a parser — the Rust parser at src-tauri/src/claude/parser.rs
// owns stream-json → ClaudeEvent translation and has its own unit tests. This
// file's responsibility is to confirm the capture corpus exists on disk (so we
// notice if the JSONL ever gets accidentally deleted) and to return a
// hand-curated ClaudeEvent[] mirroring what the parser would emit for a
// /kb document round-trip. Vitest runs this in Node, so node:fs / node:path
// are safe; production code must NOT import this file (it lives under
// __fixtures__ as a marker).

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClaudeEvent } from "../../types";

const FIXTURE_CANDIDATES = [
  "docs/superpowers/plans/.mvp4-kb-document-capture.jsonl",
  "docs/superpowers/plans/.mvp2-stream-json-capture.jsonl",
];

function pickFixturePath(): string {
  for (const rel of FIXTURE_CANDIDATES) {
    const abs = path.resolve(process.cwd(), rel);
    try {
      readFileSync(abs);
      return abs;
    } catch {
      // try next
    }
  }
  throw new Error(
    `No capture fixture found. Tried: ${FIXTURE_CANDIDATES.join(", ")}`,
  );
}

/**
 * Returns the ordered list of synthetic ClaudeEvent frames the
 * useClaudeSession reducer would consume during a single
 * `/kb document Topic` round-trip. The frames are hand-curated, not parsed
 * from the JSONL — see file-level note above.
 *
 * Throws if no candidate fixture exists on disk OR if the chosen fixture is
 * empty: the corpus must be honest, even if we don't strictly parse it.
 */
export function loadKbDocumentEvents(): ClaudeEvent[] {
  const abs = pickFixturePath();
  const raw = readFileSync(abs, "utf8");
  const lineCount = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;

  if (lineCount === 0) {
    throw new Error(`Fixture ${abs} loaded zero frames`);
  }

  return [
    { kind: "message_start", turn: 1, model: "claude-opus-4-7" },
    { kind: "partial_text", turn: 1, delta: "Creating a new document at " },
    {
      kind: "tool_use",
      turn: 1,
      tool: "Write",
      input: { file_path: "Topic Test.md", content: "# Topic Test\n" },
    },
    {
      kind: "tool_result",
      turn: 1,
      tool: "Write",
      output: { ok: true },
    },
    { kind: "partial_text", turn: 1, delta: "Topic Test.md.\n" },
    {
      kind: "message_end",
      turn: 1,
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.05 },
    },
  ];
}
