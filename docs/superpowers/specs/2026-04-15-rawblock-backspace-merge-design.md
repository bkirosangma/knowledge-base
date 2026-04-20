# Backspace-Merge at Start of RawBlock — Design

## Context

When the cursor lands on a paragraph, heading, or blockquote, `MarkdownReveal` (`src/app/knowledge_base/features/document/extensions/markdownReveal.ts`) swaps that block out for a `rawBlock` node so the user sees live markdown syntax. The `rawBlock` carries `isolating: true` by design — it prevents Delete at the end of a neighbouring rich block from dragging its content into the raw-editing view.

That same flag also disables ProseMirror's default `joinBackward` across the rawBlock boundary. As a result, pressing Backspace with the cursor at position 0 of the rawBlock does nothing, even though the intuitive behaviour (matching every other editor the user has used) is "merge this block with the one above".

This spec was revised after the first implementation surfaced three issues in live testing:

1. For atomic prevs (horizontal rule, image) the old "fall through" decision produced a dead-key (`isolating` also blocks PM's `selectNodeBackward` / `joinBackward`). The user wanted atomic prevs to be **deleted** so Backspace could step through them.
2. For list prevs, PM's `deleteBarrier` fallback pulled the rawBlock INTO the list's last item as a sibling block instead of merging its inline content there.
3. The old path used `rawBlockToRichNodes` + `tr.join`, which **parsed** the rawBlock's markdown before merging — so a rawBlock showing `# Hello` merged as just `Hello` into the prev paragraph, stripping the syntax. The user wanted syntax characters preserved verbatim.

## Goals

- Pressing Backspace at offset 0 of a top-level rawBlock merges its **raw** inline content (syntax characters included) into the previous block's last textblock.
- For atomic previous blocks (hr, image, embed), Backspace deletes the atom; the rawBlock stays and the cursor stays at offset 0.
- For wrapper previous blocks (list, blockquote, nested lists), the merge descends to the deepest, rightmost textblock inside the wrapper and inserts raw content there.
- The cursor lands at the join point between the previous textblock's original content and the merged-in content.
- The merged block keeps its original node type (paragraph stays paragraph; heading stays heading; list item's paragraph stays a list item's paragraph).
- List-item lift behaviour is preserved when the rawBlock is **inside** a list item (`$head.depth > 1`) — Tiptap's list keymap handles it.

## Non-goals

- Changing Delete behaviour. Only Backspace at offset 0 is covered.
- Relaxing `isolating: true` on the rawBlock. That flag stays as-is for every other code path.
- Merging into code blocks. If the rightmost-last textblock in the prev wrapper is a code block, the handler falls through — we don't want markdown syntax ending up as code content.

## Approach

Add a `Backspace` keyboard shortcut to the `RawBlock` node extension in `markdownReveal.ts`, alongside the existing `Enter` handler. The shortcut runs at the node's declared priority (1000). Guard cascade:

1. Selection is collapsed (`empty`). Else fall through — PM deletes the selection.
2. `$head.parent.type.name === "rawBlock"`. Else fall through.
3. `$head.parentOffset === 0`. Else fall through — PM deletes one character.
4. `$head.depth === 1` (top-level rawBlock). Else fall through — Tiptap's list keymap handles rawBlocks nested in list items.
5. `$rawStart.nodeBefore` exists. Else fall through — no previous sibling means nothing to merge with.

Once past the guards, branch on the previous node:

- **Atomic prev** (`prevNode.isAtom` — hr, image, embed, any other atomic block): delete the atom via `tr.delete(rawBlockPos - prevNode.nodeSize, rawBlockPos)`. The rawBlock stays intact; PM maps the cursor through the delete so it remains at offset 0 of the rawBlock. A second Backspace can then try again against whatever block is now above.

- **Non-atomic prev**: locate the merge target via `findMergeTarget(prevNode, prevStart, "codeBlock")` — the deepest, rightmost textblock within `prevNode`, excluding code blocks. If no valid target exists, fall through. Otherwise:
  - `tr.delete(rawBlockPos, rawBlockPos + rawBlockNode.nodeSize)` removes the rawBlock.
  - If the rawBlock had content, `tr.insert(target.end - 1, rawBlockNode.content)` inserts it just before the target textblock's closing token. `rawBlockNode.content` holds the literal markdown text shown in the raw view — inserting it verbatim preserves syntax characters (`#`, `**`, etc.), link marks, and any `wikiLink` atoms.
  - `tr.setSelection(TextSelection.create(tr.doc, target.end - 1))` places the cursor at the join point.

Single transaction, dispatched via `view.dispatch(tr.scrollIntoView())`.

## `findMergeTarget` helper

Recursive right-to-left descent through a node tree:

```ts
function findMergeTarget(
  node,
  nodeStart,    // doc position of the node's start
  excludeName,  // textblock type to skip (e.g. "codeBlock")
): { node, start, end } | null {
  if (node.isTextblock) {
    if (node.type.name === excludeName) return null;
    return { node, start: nodeStart, end: nodeStart + node.nodeSize };
  }
  if (node.isAtom || node.childCount === 0) return null;
  let childEnd = nodeStart + node.nodeSize - 1; // just before closing token
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    const childStart = childEnd - child.nodeSize;
    const result = findMergeTarget(child, childStart, excludeName);
    if (result) return result;
    childEnd = childStart;
  }
  return null;
}
```

Concrete behaviours:

- Paragraph / heading / blockquote-inner paragraph as prev → returns prev itself.
- `<bulletList>[Item1, Item2]` as prev → returns the paragraph inside `Item2`.
- `<blockquote><p>Quote</p></blockquote>` as prev → returns the paragraph inside.
- `<bulletList>[Item1, Item2[subList[Sub1, Sub2]]]` as prev → returns Sub2's paragraph (deepest-rightmost).
- Code block as the rightmost textblock → returns null (handler falls through).

## Why not relax `isolating`

The existing comment on the rawBlock schema is explicit:

> `isolating: true` — it stops backspace/delete from pulling adjacent blocks into the raw editing view

Dropping the flag would re-break the case it was added to fix: a rich block next to a rawBlock would get sucked in when the user presses Delete at its end. A targeted Backspace handler keeps the invariant intact for every other edit path and only relaxes it for the one operation the user asked for.

## Why not a separate PM plugin in `MarkdownReveal`

The existing `Enter` key handling lives on the `RawBlock` node. Keeping both keybindings in the same place means every rawBlock-specific keymap is discoverable in one location, and the handler has natural access to `this.editor` and the adjacent helper (`findMergeTarget`) in the same file.

## Position math (non-empty merge case)

Starting doc (positions shown between tokens):

```
0 <p> 1 H i 3 </p> 4 <rawBlock> 5 # _ H e l l o 12 </rawBlock> 13
```

- `rawBlockPos = $head.before() = 4`.
- `rawBlockNode.nodeSize = 9`.
- `prevNode = <p>Hi</p>`, `prevNode.nodeSize = 4`, `prevStart = 0`.
- `findMergeTarget(prev, 0, "codeBlock")` returns `{ node: prev, start: 0, end: 4 }`.
- `insertPos = target.end - 1 = 3`.
- After `tr.delete(4, 13)` the doc is `<p>Hi</p><trailing>`; position 3 still points "just before `</p>`".
- After `tr.insert(3, rawBlockNode.content)` — which inserts the 7-char text `# Hello` — the doc is `<p>Hi# Hello</p><trailing>`. Position 3 now lies between "Hi" and "# Hello".
- Cursor at position 3 lands at the join point.

For an empty rawBlock the flow is the same except the `tr.insert` is skipped; the cursor ends up at `target.end - 1`, which is the end of the previous textblock's content.

## Interaction with `MarkdownReveal`'s appendTransaction

After our Backspace transaction dispatches, `MarkdownReveal`'s appendTransaction runs on the resulting state. The cursor now sits inside the target textblock, which is a convertible node (paragraph/heading/blockquote or a list-item's paragraph). The appendTransaction will detect this and swap the target block to a rawBlock on the next pass — the cursor ends up in a rawBlock containing the merged content, which is exactly the live-edit experience the user expects after typing. No special meta flag is needed — our transaction does not set `rawSwap`, so the appendTransaction processes it normally.

## Edge cases

| Scenario | Behaviour | Reason |
|---|---|---|
| Selection not empty | Fall through | Default deletes the selection |
| Cursor mid-block in rawBlock | Fall through | Default deletes one character |
| Cursor at start, rawBlock is first block in doc | Fall through | No previous sibling |
| Cursor at start, prev is `<hr>` | **Delete the hr** | rawBlock stays; cursor stays at offset 0; second Backspace tries against the new prev |
| Cursor at start, prev is an image | **Delete the image** | Same rationale as hr |
| Cursor at start, prev is a paragraph / heading | Merge raw content into prev | Preserves syntax characters |
| Cursor at start, prev is a list | Merge raw content into last item's last textblock | Descends via `findMergeTarget` |
| Cursor at start, prev is a blockquote | Merge raw content into inner paragraph | Descends via `findMergeTarget` |
| Cursor at start, prev is a code block | Fall through | `findMergeTarget` skips codeBlocks |
| Cursor at start, rawBlock inside listItem | Fall through | `$head.depth > 1`; Tiptap's listItem keymap handles it |
| Empty rawBlock, prev is textblock-reachable | Delete rawBlock, cursor to `target.end - 1` | No inline content to insert |

## Files touched

| File | Change |
|---|---|
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | Add `findMergeTarget` helper above the `RawBlock` node definition; add `Backspace` entry to `RawBlock`'s `addKeyboardShortcuts` |

No changes to `MarkdownEditor.tsx`, `markdownSerializer.ts`, schema, or styling.

## Risks

- **Race with `appendTransaction`**: our dispatch emits one transaction; `appendTransaction` runs after it. The merged doc is in a stable state before the append runs, so the conversion-to-rawBlock on the target happens cleanly on the next tick.
- **Cursor position after insert**: verified by position-math above. The `try/catch` on `setSelection` falls through to PM's mapped selection if the computed pos is out of bounds.
- **WikiLink / link preservation**: `rawBlockNode.content` is a Fragment containing text nodes (which carry link marks) and `wikiLink` atoms. Paragraph / heading / blockquote content specs accept all of these, so the insert keeps marks and atoms intact.
- **Atoms that aren't hr or image**: the schema only ships with those two today, but any future atomic block will also be deleted on Backspace-from-below. That's consistent with the "step through atoms" rationale.

## Testing plan

Manual verification in the dev-server editor, driven programmatically via `preview_eval`:

1. `<p>Hello</p><p>World</p>` + Backspace at start of "World" → paragraph `HelloWorld` (wrapped back into rawBlock because cursor is there), cursor between "Hello" and "World".
2. `<p>Hello</p><h1>Big</h1>` + Backspace at start of "Big" → paragraph **`Hello# Big`** (heading syntax preserved verbatim), cursor between "Hello" and "# Big".
3. Single paragraph, Backspace at doc start → no change (no prev sibling).
4. `<p>Before</p><hr><p>After</p>` + Backspace at start of "After" → **hr deleted**, rawBlock `After` stays with cursor at offset 0. A second Backspace merges into `Before`.
5. Two list items, Backspace at start of second item (cursor inside a rawBlock inside listItem) → handler returns false; Tiptap's list keymap handles it.
6. `<p>Prev</p><p></p>` + Backspace in the empty paragraph → empty rawBlock deleted, cursor at end of "Prev".
7. `<p>Hello</p><p>World</p>` + Delete (not Backspace) at end of "Hello" → no change (regression check that `isolating: true` still blocks cross-block deletes).
8. `<bulletList>[Item1, Item2]</bulletList><p>After</p>` + Backspace at start of "After" → list is `[Item1, Item2After]` (raw content appended to the last item's paragraph), cursor between "Item2" and "After". Previous bug where "After" got pulled INTO listItem2 as a sibling block is gone.
9. `<blockquote><p>Quote</p></blockquote><p>After</p>` + Backspace at start of "After" → blockquote inner paragraph becomes "QuoteAfter", cursor between "Quote" and "After".

Automated tests: none — the repo has no test infrastructure for the editor.
