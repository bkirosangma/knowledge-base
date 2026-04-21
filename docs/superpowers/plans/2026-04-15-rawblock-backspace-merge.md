# Backspace-Merge at Start of RawBlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the cursor is at offset 0 of a top-level `rawBlock`, pressing Backspace merges the block's content into the previous block — replacing the current dead-key behaviour that results from the rawBlock's `isolating: true` schema flag.

**Architecture:** Add a single `Backspace` entry to the `RawBlock` node's `addKeyboardShortcuts` in `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`, alongside the existing `Enter` handler. The handler early-returns (passing through to PM's default chain) for every non-matching case; for the matching case it converts the rawBlock to rich content via the existing `rawBlockToRichNodes` helper, then uses `tr.replaceWith` + `tr.join` in a single transaction to splice the content into the previous block. The `isolating: true` flag stays on the node — this change only carves out one keybinding.

**Tech Stack:** Tiptap v3 (React), ProseMirror state/view/model primitives.

**Spec:** `docs/superpowers/specs/2026-04-15-rawblock-backspace-merge-design.md`

**Note on testing:** This project has no unit/integration test framework. Verification uses the `mcp__Claude_Preview__preview_*` tools against a running dev server, the same way every recent editor change in this repo has been verified. A real `.md` document must be opened in the preview browser (via the File System Access API picker) before running the browser-driven verification steps.

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | Add a `Backspace` entry to the `RawBlock` node's `addKeyboardShortcuts`. The `TextSelection` import is already present at line 8. No other imports needed (`rawBlockToRichNodes` is defined later in the same file). |

No other files are touched.

---

## Task 1: Add the `Backspace` handler to `RawBlock`

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`

The `RawBlock` node at line 267 already has an `Enter` keybinding (lines 350–464) that the handler pattern below mirrors. The new entry is appended to the same `addKeyboardShortcuts` object, keyed `Backspace`.

- [ ] **Step 1: Read the current `Enter` handler to confirm context**

Run the Read tool on `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` focused on lines 324–466. Confirm the `addKeyboardShortcuts` object is structured as:

```ts
addKeyboardShortcuts() {
  return {
    Enter: () => {
      // ...existing handler...
    },
  };
},
```

The `Backspace` entry goes as a second property in this same returned object.

- [ ] **Step 2: Add the `Backspace` handler**

Use the Edit tool to modify `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`. The `Enter` handler ends at line 464 with:

```ts
        view.dispatch(tr);
        return true;
      },
    };
  },
});
```

Replace that trailing block with:

```ts
        view.dispatch(tr);
        return true;
      },

      // Backspace at offset 0 of a top-level rawBlock: merge the block's
      // content into the previous block. Needed because `isolating: true`
      // blocks PM's default `joinBackward` across the rawBlock boundary.
      //
      // The handler passes through (returns false) for every non-matching
      // case, so PM's default chain (`deleteSelection` → `joinBackward` →
      // `selectNodeBackward`) still runs for mid-block Backspace, non-empty
      // selections, hr/image siblings, rawBlocks inside list items, etc.
      Backspace: () => {
        const { state, view } = this.editor;
        const { schema, selection } = state;
        const { $head, empty } = selection;

        // Cursor must be collapsed at the very start of a rawBlock's content.
        if (!empty) return false;
        if ($head.parent.type.name !== "rawBlock") return false;
        if ($head.parentOffset !== 0) return false;

        // Only top-level rawBlocks — a rawBlock inside a listItem/taskItem
        // sits at depth >= 2 (doc → list → listItem → rawBlock), and we want
        // Tiptap's list keymap to handle the lift-out-of-list case.
        if ($head.depth !== 1) return false;

        // Need a previous sibling to merge into.
        const rawBlockNode = $head.parent;
        const rawBlockPos = $head.before();
        const $rawStart = state.doc.resolve(rawBlockPos);
        const prevNode = $rawStart.nodeBefore;
        if (!prevNode) return false;

        // Atomic previous block (hr, image) — let PM's default
        // `selectNodeBackward` pick it; merging markdown syntax into an atom
        // makes no sense.
        if (prevNode.isAtom) return false;
        // Non-textblock prev (list, table) — `tr.join` can't merge a
        // textblock into one of these.
        if (!prevNode.isTextblock) return false;
        // Code blocks are textblocks, but joining markdown syntax into a code
        // block would make the raw text part of the code — almost never what
        // the user wants. Kept as a distinct opt-out so a future decision
        // doesn't require untangling the previous condition.
        if (prevNode.type.name === "codeBlock") return false;

        // Compute rich form up-front so the empty-rawBlock case and the
        // syntax-only-rawBlock case (e.g. content is just "#") share a code
        // path: either way, there's nothing meaningful to splice in, so we
        // just delete the rawBlock.
        const rich =
          rawBlockNode.content.size > 0
            ? rawBlockToRichNodes(rawBlockNode, schema)
            : [];

        const tr = state.tr;

        if (rich.length === 0) {
          tr.delete(rawBlockPos, rawBlockPos + rawBlockNode.nodeSize);
        } else {
          tr.replaceWith(
            rawBlockPos,
            rawBlockPos + rawBlockNode.nodeSize,
            rich,
          );
          try {
            tr.join(rawBlockPos);
          } catch {
            // `tr.join` can throw if the two blocks' content specs aren't
            // compatible after all (shouldn't happen given the guards above,
            // but the catch keeps the editor responsive rather than crashing
            // the keystroke). Fall through to the default chain.
            return false;
          }
        }

        // In every success path the cursor goes to `rawBlockPos - 1`, which
        // in the new doc is the end of the previous block's original content
        // (empty case: we just deleted the rawBlock; non-empty case: the
        // join removed two tokens at `rawBlockPos`, so the join point is at
        // `rawBlockPos - 1`).
        try {
          tr.setSelection(
            TextSelection.create(tr.doc, rawBlockPos - 1),
          );
        } catch {
          // Computed pos out of bounds — leave PM's mapped selection alone.
        }

        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});
```

So the file ends up with both `Enter` and `Backspace` handlers inside the `return { ... }` object.

- [ ] **Step 3: Verify TypeScript compiles**

Run:

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit
```

Expected: no output (clean compile). If there's any error, it's most likely:
- Missing `TextSelection` import — already at line 8, double-check it wasn't deleted.
- `rawBlockToRichNodes` not in scope — it's defined at line 153 in the same file, so the node's keyboard shortcut (evaluated at extension-init time) can see it via normal closure. If TS complains about hoisting, move the `RawBlock` export below `rawBlockToRichNodes` (they are already in that order in the current file).

- [ ] **Step 4: Run lint**

Run:

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npm run lint
```

Expected: no new errors or warnings in `markdownReveal.ts`. Existing unrelated warnings in other files are not this task's concern.

- [ ] **Step 5: Do not commit yet**

The project's committing policy is explicit user approval only. Leave the change unstaged for manual review after the verification task.

---

## Task 2: Smoke-test the handler in the dev server

**Files:** none modified.

This task confirms the editor still mounts and that the new handler doesn't crash under the most common scenario (two paragraphs, Backspace at start of second). Full scenario coverage is in Task 3.

- [ ] **Step 1: Ensure a `.claude/launch.json` exists**

Check whether `/Users/kiro/My Projects/knowledge-base/.claude/launch.json` exists. If it does, skip to Step 2. If not, create it with:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 2: Start the dev server**

Call `mcp__Claude_Preview__preview_start` with `name: "dev"`. Note the returned `serverId`.

- [ ] **Step 3: Wait for the server to report ready**

Call `mcp__Claude_Preview__preview_logs` with `serverId` and `search: "Ready"` (or `search: "ready in"` for Next 16). Confirm the server bound to port 3000 without errors.

- [ ] **Step 4: Check for build errors**

Call `mcp__Claude_Preview__preview_logs` with `serverId` and `level: "error"`. Expected: empty (no compile errors).

- [ ] **Step 5: Open the app and open a vault**

Call `mcp__Claude_Preview__preview_eval` with `expression: "window.location.href"` to confirm the preview is loaded. The File System Access API picker is user-gated and cannot be triggered from `preview_eval` — if the app requires picking a vault to show an editor, this step pauses for the human user to click through the picker.

After the picker is complete, call `mcp__Claude_Preview__preview_snapshot` to confirm an editor with a doc is visible (the snapshot should show a `contenteditable` element with `class="ProseMirror markdown-editor"` or similar).

- [ ] **Step 6: Check console for errors**

Call `mcp__Claude_Preview__preview_console_logs` with `level: "error"`. Expected: no errors mentioning `markdownReveal`, `rawBlock`, `Backspace`, or `TypeError`.

- [ ] **Step 7: Do not commit yet**

Same policy as Task 1.

---

## Task 3: Manual scenario verification

**Files:** none modified.

The spec lists six scenarios that exercise the handler's guarded cases and success paths. Each is performed in the running dev server from Task 2. Any scenario that fails means Task 1's code needs a fix — return to Task 1 Step 2, edit, and re-run the relevant scenarios.

Each scenario uses `mcp__Claude_Preview__preview_eval` to set the ProseMirror selection programmatically and dispatch a `Backspace` key event. Pattern:

```js
(() => {
  const editor = window.__editorForTests; // only works if an export hook is present
  // ...
})()
```

Because this project does NOT expose a test hook on `window`, each scenario instead drives the DOM directly:

```js
(() => {
  // Find the single ProseMirror editor in the doc.
  const pm = document.querySelector(".ProseMirror");
  if (!pm) return "no-editor";
  pm.focus();
  // Find the text node you want to place the cursor in, set the range,
  // then dispatch a Backspace keydown.
  const range = document.createRange();
  const target = /* chosen per scenario */;
  range.setStart(target, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  pm.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Backspace", code: "Backspace", bubbles: true, cancelable: true,
  }));
  return pm.innerText;
})()
```

If the scenario's precise setup (e.g. "insert a horizontal rule") isn't reachable via DOM alone, use the editor's toolbar buttons via `preview_click` with CSS selectors (e.g. `button[title="Horizontal rule"]`).

- [ ] **Step 1: Scenario 1 — paragraph/paragraph merge**

Open the doc. Type `Hello`, press Enter, type `World`. The editor should now hold two paragraphs.

Place the cursor at the start of "World" and press Backspace (either by hand or via the `preview_eval` pattern above).

Call `preview_snapshot` and confirm a single paragraph `HelloWorld` with the cursor between "Hello" and "World". The rich rendering may briefly flash as a rawBlock on the cursor-position conversion — that is correct and expected.

- [ ] **Step 2: Scenario 2 — heading/paragraph merge**

Start fresh (reload or clear the doc). Type `Hello`, press Enter, convert the next line to Heading 1 via the toolbar (`button[title="Heading 1"]`), type `Big`.

Place cursor at the start of "Big" and press Backspace.

Confirm the doc now contains a single **paragraph** `HelloBig` (the previous block's type wins — paragraph stays paragraph; the heading's content is absorbed).

- [ ] **Step 3: Scenario 3 — first block in doc**

Start fresh with a single paragraph `Only`. Place cursor at the start of "Only" (i.e. position 0).

Press Backspace.

Confirm the doc is unchanged (`Only` remains). The handler returns false because there is no previous sibling; PM's default chain also no-ops at doc start.

- [ ] **Step 4: Scenario 4 — previous block is horizontal rule**

Start fresh. Type `Before`, press Enter, click the Horizontal rule toolbar button (`button[title="Horizontal rule"]`), type `After`.

Place cursor at the start of "After" and press Backspace.

Confirm:
- First Backspace: the `<hr>` becomes node-selected (PM's `selectNodeBackward` default fires because our handler returned `prevNode.isAtom` → false → pass-through).
- Second Backspace: the `<hr>` is deleted, and the cursor is inside a single paragraph `BeforeAfter` (PM's default join runs without a rawBlock in the way).

- [ ] **Step 5: Scenario 5 — list item lift**

Start fresh. Create a bullet list via the toolbar (`button[title="Bullet list"]`) and add two items: `Item1` and `Item2`.

Place cursor at the start of `Item2` and press Backspace.

Confirm `Item2` lifts out of the list (becomes a top-level paragraph, or removes the list marker from that item — either is Tiptap's default behaviour and both are acceptable). The point is that the list-item keymap wins and our handler does not interfere, because `$head.depth > 1` when the rawBlock is inside a listItem.

- [ ] **Step 6: Scenario 6 — empty rawBlock between two paragraphs**

Start fresh. Type `Prev`, press Enter (leaves an empty paragraph), press Enter again to add a second empty line.

Place cursor in the first empty line and press Backspace.

Confirm the empty block is removed and the cursor lands at the end of `Prev`.

- [ ] **Step 7: Regression check — rawBlock invariants still hold**

In any doc with at least two paragraphs, place the cursor in the middle of the FIRST paragraph (not at offset 0). Press Delete (not Backspace).

Confirm the second paragraph is NOT pulled into a rawBlock view on the first paragraph. The `isolating: true` flag is still respected because this change only added a Backspace keybinding, didn't modify the schema.

- [ ] **Step 8: Stop the dev server**

Call `mcp__Claude_Preview__preview_stop` with the `serverId` from Task 2 Step 2.

---

## Completion

Once all scenario steps pass, the feature is complete. The implementing agent should:

1. Summarise for the user which scenarios passed.
2. Wait for user approval before any `git add` / `git commit` (project policy).
3. If the user approves a commit, use the existing project convention `feat(document): …` for the message. A reasonable subject line: `feat(document): merge rawBlock into previous block on Backspace`.
