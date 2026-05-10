import { describe, it, expect } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { type MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import MarkdownEditor from "./MarkdownEditor";
import { forceExitRawBlock } from "../extensions/rawSyntaxEngine";

// Promotes four MVP-5-deferred cases that previously couldn't run because
// `MarkdownEditor` exposed no editor handle:
//
//   DOC-4.3-38  Enter inside a rawBlock-in-listItem splits the list item.
//   DOC-4.3-39  Backspace at offset 0 of a top-level rawBlock merges its
//               literal markdown content into the previous textblock.
//   DOC-4.5-13  Force-exit rawBlock before structural commands — the
//               bullet-list toolbar action lifts the cursor out of the
//               rawBlock first, then wraps the content in a bulletList.
//   DOC-4.5-18  Link button with text selected wraps the selection.
//
// Test seam: a `tiptapEditorRef` prop pushes the live `Editor` into a
// `MutableRefObject` so tests can drive selection / keymap / commands
// directly. Production callers leave the prop unset.
//
// markdownReveal pipeline note: while the cursor sits inside a "convertible"
// block (paragraph, heading, blockquote, listItem) markdownReveal converts
// that block to a `rawBlock` automatically, and restores it to rich content
// once the cursor leaves. Tests that need a rawBlock at a specific position
// just have to move the cursor there.

async function mountEditor(
  content: string,
): Promise<MutableRefObject<Editor | null>> {
  const ref: MutableRefObject<Editor | null> = { current: null };
  function Harness() {
    return <MarkdownEditor content={content} tiptapEditorRef={ref} />;
  }
  render(<Harness />);
  await waitFor(
    () => {
      if (!ref.current) throw new Error("editor not yet mounted");
    },
    { timeout: 3000 },
  );
  return ref;
}

function setCaret(editor: Editor, pos: number): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    );
  });
}

/** Walk the rich doc to find the first node by type name. */
function findNode(
  editor: Editor,
  typeName: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === typeName) {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

/** Drive a keymap shortcut by walking the registered ProseMirror plugins
 *  via `view.someProp('handleKeyDown')` — the same path a real keydown
 *  takes. */
function pressKey(editor: Editor, key: string): void {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    editor.view.someProp("handleKeyDown", (fn) =>
      Boolean((fn as (v: unknown, e: KeyboardEvent) => boolean)(editor.view, event)),
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("MarkdownEditor — tiptapEditorRef-driven keymap (Theme B)", () => {
  it("DOC-4.3-38: Enter inside a rawBlock-in-listItem splits the list item", async () => {
    // The list item's content is auto-converted to a rawBlock at mount because
    // the default cursor (pos 0) lands inside it.
    const ref = await mountEditor("- **bold** trailing text\n");
    const editor = ref.current!;

    const raw = await waitFor(() => {
      const r = findNode(editor, "rawBlock");
      if (!r) throw new Error("rawBlock not yet materialised");
      return r;
    });
    expect(raw.node.textContent).toBe("**bold** trailing text");

    // Place the caret at offset 8 inside the rawBlock content (right after
    // the closing `**` of `**bold**`).
    setCaret(editor, raw.pos + 1 + 8);
    pressKey(editor, "Enter");

    // The keymap's listItem-aware split branch produced two list items.
    const items: ProseMirrorNode[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "listItem") {
        items.push(node);
        return false;
      }
      return true;
    });
    expect(items, "Enter inside the rawBlock-listItem should produce a 2-item list").toHaveLength(2);

    // After the split, markdownReveal restores the before-half (cursor left
    // it) to its rich form — so its textContent renders as "bold" (the
    // asterisks become a `<strong>` mark, not literal text). The after-half
    // is now under the cursor and stays as a rawBlock with literal text.
    expect(items[0].textContent).toBe("bold");
    expect(items[1].textContent).toBe(" trailing text");
  });

  it("DOC-4.3-39: Backspace at offset 0 of a top-level rawBlock merges its content into the previous paragraph", async () => {
    const ref = await mountEditor("first paragraph\n\n**bold** body\n");
    const editor = ref.current!;

    // At mount the FIRST block is auto-converted to a rawBlock (cursor at
    // pos 0). Moving the cursor into the second block (a paragraph) makes
    // markdownReveal restore the first to a paragraph and convert the
    // second to a rawBlock — exactly the setup we need.
    const blocks: { node: ProseMirrorNode; pos: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs && (node.type.name === "paragraph" || node.type.name === "rawBlock")) {
        blocks.push({ node, pos });
        return false;
      }
      return true;
    });
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    setCaret(editor, blocks[1].pos + 2);

    const raw = await waitFor(() => {
      const r = findNode(editor, "rawBlock");
      if (!r) throw new Error("rawBlock not yet materialised");
      // Skip the empty trailing paragraph; we want the converted content block.
      if (r.node.textContent.length === 0) throw new Error("rawBlock is the empty trailing block, wait for the real one");
      return r;
    });
    expect(raw.node.textContent).toBe("**bold** body");

    // Caret to offset 0 of the rawBlock and Backspace.
    setCaret(editor, raw.pos + 1);
    pressKey(editor, "Backspace");

    // After merge: the keymap deletes the rawBlock and inserts its literal
    // markdown content at the end of the previous textblock. The cursor
    // lands in the merged block, which markdownReveal then converts back
    // to a rawBlock under the cursor — so the final shape is one block at
    // the doc top with the merged text content "first paragraph**bold** body".
    const top = editor.state.doc.firstChild!;
    expect(top.textContent).toBe("first paragraph**bold** body");

    // Sanity: there is exactly one content block (excluding any empty
    // trailing paragraph the markdown layer may have added).
    const contentBlocks: ProseMirrorNode[] = [];
    editor.state.doc.descendants((node) => {
      if (node.attrs && (node.type.name === "paragraph" || node.type.name === "rawBlock")) {
        if (node.textContent.length > 0) contentBlocks.push(node);
        return false;
      }
      return true;
    });
    expect(contentBlocks).toHaveLength(1);
  });

  it("DOC-4.5-13: Force-exit rawBlock before structural commands — bulletList wraps the content after exit", async () => {
    const ref = await mountEditor("**bold** content\n");
    const editor = ref.current!;

    // markdownReveal converts the cursor-block to rawBlock automatically.
    const raw = await waitFor(() => {
      const r = findNode(editor, "rawBlock");
      if (!r || r.node.textContent.length === 0) throw new Error("rawBlock not yet materialised");
      return r;
    });
    expect(raw.node.textContent).toBe("**bold** content");

    // forceExitRawBlock returns true when cursor is in a rawBlock — exactly
    // what the toolbar's list buttons do before chaining toggleBulletList.
    let exited = false;
    act(() => {
      exited = forceExitRawBlock(editor);
    });
    expect(exited).toBe(true);
    // After force-exit the rawBlock should be gone; chain into a bullet list.
    act(() => {
      editor.chain().focus().toggleBulletList().run();
    });

    expect(findNode(editor, "bulletList"), "structural command should wrap the resulting block in a bulletList").toBeTruthy();
    // The original markdown text is preserved (forceExitRawBlock restores the
    // rich form with proper marks; we don't pin the exact text shape since
    // markdownReveal may re-convert under the cursor — the case is the
    // structural-command wrapping, not the inline shape).
  });

  it("DOC-4.5-18: Link button with text selected wraps the selection", async () => {
    const ref = await mountEditor("see anchor for context\n");
    const editor = ref.current!;

    // First block is auto-rawBlock at mount (cursor at 0). Locate it and the
    // text content position.
    const firstBlock = await waitFor(() => {
      const block = editor.state.doc.firstChild;
      if (!block || block.textContent.length === 0) throw new Error("first block not yet materialised");
      return block;
    });
    expect(firstBlock.textContent).toBe("see anchor for context");

    // Select the word "anchor" (chars 4..10). Block content starts at pos 1.
    const start = 1 + "see ".length;
    const end = start + "anchor".length;
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, start, end),
        ),
      );
    });

    // Apply link via the same chain the toolbar Link button uses. Even
    // inside a rawBlock the link mark is allowed (RawBlock spec line ~89:
    // "Only the link mark is allowed inside a rawBlock").
    act(() => {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: "https://example.com" })
        .run();
    });

    // Walk the doc for a text run carrying a `link` mark.
    let linkedText: string | null = null;
    let linkHref: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const linkMark = node.marks.find((m) => m.type.name === "link");
        if (linkMark) {
          linkedText = node.text ?? null;
          linkHref = (linkMark.attrs.href as string | undefined) ?? null;
        }
      }
      return true;
    });
    expect(linkedText).toBe("anchor");
    expect(linkHref).toBe("https://example.com");
  });
});
