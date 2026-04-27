/**
 * Tiptap Image extension specialized for the vault. Canonical `src` values
 * stored in markdown look like `.attachments/<sha256-12>.<ext>` — those are
 * stable, portable paths inside the vault but unfetchable from the browser
 * (no HTTP origin serves them). This extension keeps the canonical `src`
 * on the model + as `data-vault-src` on the rendered `<img>` (so the
 * markdown serializer round-trips it), and at render time the NodeView
 * reads the file via `AttachmentRepository`, wraps the bytes in a blob
 * URL, and assigns that blob URL to the actual `<img>.src`. External
 * `src` values (http(s):, data:, blob:) bypass the resolver.
 */

import { Image, type ImageOptions } from "@tiptap/extension-image";

import type { AttachmentRepository } from "../../../domain/repositories";

export interface VaultImageOptions extends ImageOptions {
  /** Mutable ref read lazily by the NodeView so the editor doesn't need to
   *  be re-initialized when the vault opens. */
  repoRef: { current: AttachmentRepository | null };
  /** Forwards FS errors (e.g. file deleted, permission revoked) to
   *  `ShellErrorContext`. */
  onError?: (err: unknown) => void;
}

const VAULT_PREFIX = ".attachments/";

export const VaultImage = Image.extend<VaultImageOptions>({
  addOptions() {
    const parent = this.parent?.();
    return {
      inline: parent?.inline ?? false,
      allowBase64: parent?.allowBase64 ?? false,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      resize: parent?.resize ?? false,
      repoRef: { current: null as AttachmentRepository | null },
      onError: undefined,
    };
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("img");
      const repoRef = this.options.repoRef;
      const onError = this.options.onError;

      let currentBlobUrl: string | null = null;
      let currentSrc: string | null = null;

      function revokeCurrent() {
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
      }

      async function resolveVaultSrc(vaultSrc: string) {
        const repo = repoRef.current;
        if (!repo) return;
        const filename = vaultSrc.slice(VAULT_PREFIX.length);
        try {
          const blob = await repo.read(filename);
          // src may have changed during the await — bail if so.
          if (currentSrc !== vaultSrc) return;
          revokeCurrent();
          currentBlobUrl = URL.createObjectURL(blob);
          dom.src = currentBlobUrl;
        } catch (err) {
          onError?.(err);
        }
      }

      function applyAttrs(attrs: Record<string, unknown>) {
        const src = (attrs.src as string | null) ?? null;
        const alt = (attrs.alt as string | null) ?? "";
        const title = (attrs.title as string | null) ?? null;

        dom.alt = alt;
        if (title) dom.title = title;
        else dom.removeAttribute("title");

        if (src === currentSrc) return;
        currentSrc = src;

        if (!src) {
          revokeCurrent();
          dom.removeAttribute("src");
          dom.removeAttribute("data-vault-src");
          return;
        }

        if (src.startsWith(VAULT_PREFIX)) {
          // Stash the canonical path so the editor DOM keeps a portable
          // reference (the actual <img>.src will be replaced with a blob
          // URL once the resolver completes).
          dom.dataset.vaultSrc = src;
          // Kick off the async resolve. Until it lands, leave the previous
          // blob URL up (revoked inside resolveVaultSrc) so the user
          // doesn't see a flash of broken icon.
          resolveVaultSrc(src);
        } else {
          // External URL — bypass resolver, drop any previous blob URL.
          revokeCurrent();
          delete dom.dataset.vaultSrc;
          dom.src = src;
        }
      }

      applyAttrs(node.attrs);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== "image") return false;
          applyAttrs(updatedNode.attrs);
          return true;
        },
        destroy() {
          revokeCurrent();
        },
      };
    };
  },
});
