/**
 * Tiptap Extension that intercepts paste and drag-drop of image/* items,
 * writes the bytes to `.attachments/<sha256-12>.<ext>` via the caller-supplied
 * `AttachmentRepository`, then inserts a markdown image node at the cursor.
 *
 * Usage: call `createImagePasteExtension(options)` and include in the editor's
 * extensions array.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { AttachmentRepository } from "../../../domain/repositories";

export interface ImagePasteOptions {
  /** AttachmentRepository — null while no vault is open (plugin no-ops). */
  repo: AttachmentRepository | null;
  onError: (err: unknown) => void;
  onUploadStart: (id: string, filename: string) => void;
  onUploadEnd: (id: string) => void;
}

const pluginKey = new PluginKey("imagePasteHandler");

async function sha256prefix(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function extensionFromMime(mimeType: string): string {
  const sub = mimeType.split("/")[1] ?? "bin";
  return sub === "jpeg" ? "jpg" : sub;
}

async function handleImageFile(
  file: File,
  view: EditorView,
  options: ImagePasteOptions,
): Promise<void> {
  const { repo, onError, onUploadStart, onUploadEnd } = options;
  if (!repo) return;

  const bytes = await file.arrayBuffer();
  const hash = await sha256prefix(bytes);
  const ext = extensionFromMime(file.type);
  const filename = `${hash}.${ext}`;
  const src = `.attachments/${filename}`;

  const uploadId = `${Date.now()}-${filename}`;
  const showChip = file.size > 100_000;
  if (showChip) onUploadStart(uploadId, filename);

  try {
    const alreadyExists = await repo.exists(filename);
    if (!alreadyExists) {
      await repo.write(filename, bytes);
    }

    const { state, dispatch } = view;
    const imageType = state.schema.nodes.image;
    if (!imageType) return;
    const node = imageType.create({ src, alt: "" });
    const tr = state.tr.replaceSelectionWith(node);
    dispatch(tr);
  } catch (err) {
    onError(err);
  } finally {
    if (showChip) onUploadEnd(uploadId);
  }
}

function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

/**
 * Creates a Tiptap Extension that adds image paste and drag-drop support.
 * Pass an options object whose `repo` property is a getter so it can be read
 * dynamically (useful when the repo is provided via a React ref).
 */
export function createImagePasteExtension(options: ImagePasteOptions): Extension {
  return Extension.create({
    name: "imagePasteHandler",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          props: {
            handlePaste(_view, event) {
              const dt = event.clipboardData;
              if (!dt) return false;
              const images = extractImageFiles(dt);
              if (images.length === 0) return false;
              event.preventDefault();
              for (const file of images) {
                handleImageFile(file, _view, options);
              }
              return true;
            },

            handleDrop(_view, event) {
              const dt = event.dataTransfer;
              if (!dt) return false;
              const images = extractImageFiles(dt);
              if (images.length === 0) return false;
              event.preventDefault();
              const pos = _view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (pos) {
                const resolved = _view.state.doc.resolve(pos.pos);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const sel = (_view.state.selection.constructor as any).near(resolved);
                const tr = _view.state.tr.setSelection(sel);
                _view.dispatch(tr);
              }
              for (const file of images) {
                handleImageFile(file, _view, options);
              }
              return true;
            },
          },
        }),
      ];
    },
  });
}
