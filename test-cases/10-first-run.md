# Test Cases — First-run experience (KB-012)

> Mirrors §10 of [Features.md](../Features.md). FIRSTRUN-10.1 / 10.2
> cover the retired FirstRunHero + seedSampleVault flow (🚫 from MVP-1e —
> replaced by `NoVaultCTA` in `knowledgeBase.tsx`); FIRSTRUN-10.3 covers
> the bundled `public/sample-vault/` content (still shipped, no live
> consumer post-MVP-1e).
>
> ID scheme follows `test-cases/README.md`: `FIRSTRUN-10.<sub>-<nn>`.

---

## FIRSTRUN-10.1 First-run hero (`FirstRunHero.tsx`) — 🚫 Removed in MVP-1e

- **FIRSTRUN-10.1-01** 🚫 Removed in MVP-1e — `FirstRunHero` deleted; replaced by `NoVaultCTA` (covered by `SHELL-1.17-06`).
- **FIRSTRUN-10.1-02** 🚫 Removed in MVP-1e — `FirstRunHero` deleted; no-vault state now renders `NoVaultCTA` (path-based via `settingsStore.lastPath`, not localStorage).
- **FIRSTRUN-10.1-03** 🚫 Removed in MVP-1e — `FirstRunHero` deleted; the no-vault → vault-open transition is now driven by `useFileExplorer.openFolder` swapping `NoVaultCTA` for the explorer.
- **FIRSTRUN-10.1-04** 🚫 Removed in MVP-1e — `FirstRunHero` deleted; equivalent CTA-to-`openFolder` wiring lives in `NoVaultCTA` (`SHELL-1.17-06`).
- **FIRSTRUN-10.1-05** 🚫 Removed in MVP-1e — `seedSampleVault` deleted; sample-vault onboarding is retired. No replacement.
- **FIRSTRUN-10.1-06** 🚫 Removed in MVP-1e — `FirstRunHero` and its seeding state deleted.
- **FIRSTRUN-10.1-07** 🚫 Removed in MVP-1e — `FirstRunHero` and its error banner deleted.
- **FIRSTRUN-10.1-08** 🚫 Removed in MVP-1e — `FirstRunHero` "What's a vault?" disclosure deleted.
- **FIRSTRUN-10.1-09** 🚫 Removed in MVP-1e — mobile notice deleted with `FirstRunHero`. KB-040 mobile read-only enforcement is still covered by FS-2.3-66/67.

## FIRSTRUN-10.2 Sample vault loader (`seedSampleVault.ts`) — 🚫 Removed in MVP-1e

- **FIRSTRUN-10.2-01** 🚫 Removed in MVP-1e — `seedSampleVault.ts` deleted (FSA-only path; redundant with MVP-1c's `UninitializedVaultSplash` + Header `VaultSwitcher`).
- **FIRSTRUN-10.2-02** 🚫 Removed in MVP-1e — `seedSampleVault.ts` deleted.
- **FIRSTRUN-10.2-03** 🚫 Removed in MVP-1e — `seedSampleVault.ts` deleted.
- **FIRSTRUN-10.2-04** 🚫 Removed in MVP-1e — `seedSampleVault.ts` deleted; e2e `firstRunHero.spec.ts` was deleted in the same MVP.

## FIRSTRUN-10.3 Sample vault content (`public/sample-vault/`)

- **FIRSTRUN-10.3-01** ⚙️ **Five `.md` documents about a "Books API" project** — README + architecture + api-reference + design-decisions + roadmap, each with realistic prose, all cross-linked via `[[wiki-links]]`.
- **FIRSTRUN-10.3-02** ⚙️ **One diagram (`system-overview.json`)** — three layers (Edge / Services / Data), four nodes (Web Client → API Gateway → Reading-list Service → Postgres), three connections, one named flow ("Read a list").
- **FIRSTRUN-10.3-03** ⚙️ **One SVG (`logo.svg`)** — gradient-on-rounded-rect with the "Books API" title underneath.
- **FIRSTRUN-10.3-04** ⚙️ **One image in `.attachments/cover.png`** — real 96×64 RGBA PNG, generated deterministically from the seed script in the PR commit message; referenced from `README.md`.
- **FIRSTRUN-10.3-05** ⚙️ **Manifest at `manifest.json`** — `version`, `description`, ordered `files[]` with `path` + `kind: "text" | "binary"`, optional `openOnLoad`.
