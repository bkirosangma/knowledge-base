# Test Cases — First-run experience (KB-012)

> Mirrors §10 of [Features.md](../Features.md). Covers the FirstRunHero
> component and the bundled sample-vault flow.
>
> ID scheme follows `test-cases/README.md`: `FIRSTRUN-10.<sub>-<nn>`.

---

## FIRSTRUN-10.1 First-run hero (`FirstRunHero.tsx`)

- **FIRSTRUN-10.1-01** ✅ **Hero renders when `!directoryName && tree.length === 0`** — `knowledgeBase.tsx` swaps the "No file open" empty state for the hero.
- **FIRSTRUN-10.1-02** 🧪 **Cleared localStorage shows the hero on first paint** — fresh load with no persisted vault → hero is visible. _(e2e: `firstRunHero.spec.ts STOP-1`.)_
- **FIRSTRUN-10.1-03** 🧪 **Hero disappears once any vault has been opened** — clicking Open Vault and picking a folder hides the hero. _(e2e: `firstRunHero.spec.ts STOP-3`.)_
- **FIRSTRUN-10.1-04** ✅ **Open Vault CTA fires `onOpenFolder`** — primary button delegates to the existing `useFileExplorer.openFolder` picker.
- **FIRSTRUN-10.1-05** ✅ **Try with sample vault CTA fires `onOpenWithSeed` with the seeder** — secondary button passes a function that calls `seedSampleVault(handle)`.
- **FIRSTRUN-10.1-06** ✅ **Both buttons disabled while seeding** — prevents double-clicks during the picker → write → scan window.
- **FIRSTRUN-10.1-07** ✅ **Error banner surfaces seed failures** — a thrown error during seeding renders an `[role=alert]` element with the message; idle state otherwise.
- **FIRSTRUN-10.1-08** ✅ **"What's a vault?" disclosure toggles a 3-bullet explainer** — collapsed by default, opens on click, closes on second click.
- **FIRSTRUN-10.1-09** ✅ **Mobile browsing notice (KB-040)** — when `useViewport().isMobile` is `true`, the hero shows a small notice (`[data-testid="first-run-mobile-notice"]`, `role="note"`) telling the user that creating new files and switching vaults is desktop-only ("Mobile is for browsing"). The notice scopes the message to creation + vault-switching to match what KB-040 actually disables (FS-2.3-66/67); it does not claim editing of existing files is blocked. Hidden on desktop viewports.

## FIRSTRUN-10.2 Sample vault loader (`seedSampleVault.ts`)

- **FIRSTRUN-10.2-01** ✅ **Writes every manifest file into the target dir** — text and binary files alike land at the manifest-listed path.
- **FIRSTRUN-10.2-02** ✅ **Creates intermediate directories for nested paths** — `.attachments/cover.png` lands in a freshly-created `.attachments/` subdir.
- **FIRSTRUN-10.2-03** ✅ **Throws on a manifest fetch failure** — caller (the hero) catches and displays the error banner.
- **FIRSTRUN-10.2-04** 🧪 **Sample-vault flow ends with populated content** — end-to-end: hero CTA → picker → write → scan → explorer shows README + architecture + system-overview. _(e2e: `firstRunHero.spec.ts STOP-2`.)_

## FIRSTRUN-10.3 Sample vault content (`public/sample-vault/`)

- **FIRSTRUN-10.3-01** ⚙️ **Five `.md` documents about a "Books API" project** — README + architecture + api-reference + design-decisions + roadmap, each with realistic prose, all cross-linked via `[[wiki-links]]`.
- **FIRSTRUN-10.3-02** ⚙️ **One diagram (`system-overview.json`)** — three layers (Edge / Services / Data), four nodes (Web Client → API Gateway → Reading-list Service → Postgres), three connections, one named flow ("Read a list").
- **FIRSTRUN-10.3-03** ⚙️ **One SVG (`logo.svg`)** — gradient-on-rounded-rect with the "Books API" title underneath.
- **FIRSTRUN-10.3-04** ⚙️ **One image in `.attachments/cover.png`** — real 96×64 RGBA PNG, generated deterministically from the seed script in the PR commit message; referenced from `README.md`.
- **FIRSTRUN-10.3-05** ⚙️ **Manifest at `manifest.json`** — `version`, `description`, ordered `files[]` with `path` + `kind: "text" | "binary"`, optional `openOnLoad`.
