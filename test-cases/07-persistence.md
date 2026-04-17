# Test Cases — Persistence Surface

> Mirrors §7 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.
>
> Covers WHERE state lives and how it round-trips across storage layers. Feature-level behaviours that happen to use persistence (e.g. diagram save/load) are in [03-diagram.md](03-diagram.md) / [04-document.md](04-document.md); this file owns the _storage-layer contract_.

---

## 7.1 localStorage (Scoped)

- **PERSIST-7.1-01** ✅ **Every key is scope-prefixed when a scope is set** — `scopedKey('explorer.sort')` with scope `'abc12345'` returns `'explorer.sort[abc12345]'`.
- **PERSIST-7.1-02** ✅ **Unscoped keys used pre-folder** — `scopedKey('x')` with no active scope returns `'x'` verbatim.
- **PERSIST-7.1-03** ✅ **Scope switch isolates keys** — `saveDiagram` under scope A then switch to scope B → `loadDiagram()` returns defaults; switch back to A → A's data is intact. Same isolation holds for drafts (`listDrafts`, `hasDraft`).
- **PERSIST-7.1-04** ❌ **Explorer sort field / direction / grouping persisted.**
- **PERSIST-7.1-05** ❌ **Explorer filter (`all | diagrams | documents`) persisted.**
- **PERSIST-7.1-06** ❌ **Explorer collapse flag persisted.**
- **PERSIST-7.1-07** ❌ **Split ratio persisted per `storageKey`.**
- **PERSIST-7.1-08** ✅ **Pane layout persisted** — `savePaneLayout(left, right, focus, lastClosed)` → `loadPaneLayout()` round-trips the full `SavedPaneLayout` shape; corrupted JSON returns `null`.
- **PERSIST-7.1-09** ❌ **"Don't ask again" flags persisted** — keyed per popover type (e.g., discard).
- **PERSIST-7.1-10** ❌ **Per-diagram viewport (zoom + scroll) persisted** — `migrateViewport` and `clearViewport` per-file helpers verified in unit tests; full viewport save path goes through the viewport hook (covered in later bucket).
- **PERSIST-7.1-11** ✅ **Per-diagram drafts persisted** — `saveDraft`/`loadDraft`/`hasDraft`/`clearDraft`/`listDrafts` all scoped; `cleanupOrphanedData` prunes drafts for files no longer in the vault.
- **PERSIST-7.1-12** ❌ **Document-properties collapse flag persisted.**
- **PERSIST-7.1-13** ❌ **Reset App clears every scoped and unscoped key** — after Reset + reload, localStorage length is 0.
- **PERSIST-7.1-14** ✅ **Graceful fallback when localStorage is full / unavailable** — `saveDiagram` and `saveDraft` swallow `QuotaExceededError` and return without throwing; `loadDiagram` / `loadPaneLayout` / `loadDraft` return defaults / null on corrupt JSON.
- **PERSIST-7.1-15** 🚫 **Private mode** — equivalent to 7.1-14 at the localStorage API level; covered by the quota-error test since jsdom cannot simulate browser private-mode semantics directly.

## 7.2 IndexedDB

- **PERSIST-7.2-01** ❌ **Database name = `knowledge-base`.**
- **PERSIST-7.2-02** ❌ **Object store = `handles`.**
- **PERSIST-7.2-03** ❌ **`saveDirHandle(key, handle)` writes entry.**
- **PERSIST-7.2-04** ❌ **`loadDirHandle(key)` reads entry.**
- **PERSIST-7.2-05** ❌ **`clearDirHandle(key)` removes entry.**
- **PERSIST-7.2-06** ❌ **Schema upgrade path** — bumping DB version creates the store if missing (on an empty DB).
- **PERSIST-7.2-07** ❌ **Handle persists across reloads** — stored → reload → `loadDirHandle` returns the same handle object identity or equivalent (per spec).
- **PERSIST-7.2-08** ❌ **Handle removal on scope clear** — clearing a scope removes its IDB entry (if that's the policy — verify).

## 7.3 Disk (File System Access API)

### 7.3.a Vault structure
- **PERSIST-7.3-01** ❌ **Diagrams saved as `.json`.**
- **PERSIST-7.3-02** ❌ **Documents saved as `.md`.**
- **PERSIST-7.3-03** ❌ **History sidecars at `.<name>.history.json`** — hidden (dot-prefix).
- **PERSIST-7.3-04** ❌ **Vault config at `.archdesigner/config.json`.**
- **PERSIST-7.3-05** ❌ **Link index at `.archdesigner/_links.json`.**
- **PERSIST-7.3-06** ❌ **Graphify cross-refs at `.archdesigner/cross-references.json`.**
- **PERSIST-7.3-07** ❌ **`.archdesigner/` folder created on first save that needs it** — not before.

### 7.3.b Round-trips
- **PERSIST-7.3-08** ❌ **Diagram save → reload → identical tree** — JSON round-trip preserves layers, nodes, connections, flows.
- **PERSIST-7.3-09** ❌ **Document save → reload → markdown round-trip preserved.**
- **PERSIST-7.3-10** ❌ **Viewport round-trip** — zoom + scroll restored exactly.
- **PERSIST-7.3-11** ❌ **Manual layer sizes restored.**
- **PERSIST-7.3-12** ❌ **Measured node sizes restored.**
- **PERSIST-7.3-13** ❌ **Icon names round-trip** — `iconName: "Server"` survives save/load.
- **PERSIST-7.3-14** ❌ **Legacy colour classes migrated on load** — old `bg-blue-500` → hex.

### 7.3.c Failure modes
- **PERSIST-7.3-15** ❌ **Revoked permission surfaces error** — simulated; app asks for permission again or shows a banner.
- **PERSIST-7.3-16** ❌ **Partial write retry** — simulate truncated write → retry path present (if implemented; otherwise 🚫 with rationale).
- **PERSIST-7.3-17** ❌ **External rename detection via FNV-1a** — disk changed outside app → history detects on next open.

## 7.4 Draft ↔ Disk Interaction

- **PERSIST-7.4-01** ❌ **Edit writes draft immediately** — local change → localStorage key updated within the same tick cycle (or after debounce — verify).
- **PERSIST-7.4-02** ❌ **Open file with newer draft than disk** — draft wins; editor marked dirty.
- **PERSIST-7.4-03** ❌ **Open file with no draft** — disk content used; clean state.
- **PERSIST-7.4-04** ❌ **Save clears draft for that path.**
- **PERSIST-7.4-05** ❌ **Discard clears draft without writing disk.**
- **PERSIST-7.4-06** ❌ **`listDrafts` returns all scoped draft keys.**
- **PERSIST-7.4-07** ✅ **Draft for deleted file removed** — `cleanupOrphanedData(existingFiles)` removes drafts (and viewport entries) for every file not in the set; unrelated non-draft / non-viewport keys are left untouched.

## 7.5 Cross-Store Invariants

- **PERSIST-7.5-01** ❌ **Scope ID consistency** — IDB key and localStorage scope suffix reference the same scope ID for a given folder.
- **PERSIST-7.5-02** ❌ **No orphaned keys after folder change** — switching folders does not leave the prior folder's keys in active use.
- **PERSIST-7.5-03** ❌ **Reset App clears localStorage AND reloads AND does NOT wipe disk files** — vault files untouched.
- **PERSIST-7.5-04** ❌ **Reset App does NOT clear IDB handle** — or if it does, that is documented behaviour; user must re-open folder. _(Verify intended semantics.)_
