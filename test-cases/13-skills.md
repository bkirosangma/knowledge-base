# Test Cases — Skills

> Mirrors §11.x (Claude Chat Surface, MVP-3 additions) of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

Skill bootstrap (install-on-first-launch), `/kb` invocation surfaces (slash-command palette in the composer, Skills sheet, vault file picker), and the "Initialize with full template" action that the splash + vault-switcher dropdown surface. MVP-3 surface — see `Features.md` §11.x for the feature catalogue.

---

## SKILLS-13.1 Skill bootstrap

Implemented by `useSkillBootstrap` (per-session module-level guard) + `SkillInstallToast` (3 s auto-dismiss, no library) + Rust `skill_status` / `skill_install_from_bundle`.

- **SKILLS-13.1-01** ✅ **Bootstrap no-ops when skill already present** — when `~/.claude/skills/knowledge-base/` already exists, `useSkillBootstrap` calls `skill_status`, sees `installed: true`, and does not invoke `skill_install_from_bundle`. _(unit: `useSkillBootstrap.test.ts`)_
- **SKILLS-13.1-02** ✅ **Bootstrap copies bundled skill on first drawer open** — when `skill_status` returns `installed: false`, `skill_install_from_bundle` is called and the toast is shown. _(unit: `useSkillBootstrap.test.ts`)_
- **SKILLS-13.1-03** ✅ **Bootstrap fires only once per session** — a module-level boolean guard prevents `skill_status` from being re-invoked if `useSkillBootstrap` is remounted within the same session. _(unit: `useSkillBootstrap.test.ts`)_
- **SKILLS-13.1-04** ✅ **Bootstrap surfaces install errors without crashing the drawer** — when `skill_install_from_bundle` rejects, the error is caught and does not propagate to the drawer; no unhandled rejection. _(unit: `useSkillBootstrap.test.ts`)_
- **SKILLS-13.1-05** ✅ **Toast appears with the install message** — `SkillInstallToast` renders the install confirmation message when `show=true`. _(unit: `SkillInstallToast.test.tsx`)_
- **SKILLS-13.1-06** ✅ **Toast auto-dismisses after 3 seconds** — after mounting with `show=true`, the component calls `onDismiss` after 3000 ms. _(unit: `SkillInstallToast.test.tsx`)_
- **SKILLS-13.1-07** ✅ **Toast does not render when show=false** — `SkillInstallToast` renders nothing when `show=false`. _(unit: `SkillInstallToast.test.tsx`)_
- **SKILLS-13.1-08** ✅ **Error-tone toast renders with role=alert** — `SkillInstallToast` with `tone="error"` renders `role="alert"` (not `role="status"`) so screen readers announce it urgently. _(unit: `SkillInstallToast.test.tsx`)_
- **SKILLS-13.1-09** ✅ **Error-tone toast still auto-dismisses after 3 s** — the auto-dismiss timer applies regardless of `tone`. _(unit: `SkillInstallToast.test.tsx`)_
- **SKILLS-13.1-10** ✅ **ClaudeDrawer renders error toast when `skillBootstrap.error` is set** — when `useSkillBootstrap` returns a non-null error, the error-variant `SkillInstallToast` is rendered. _(unit: `ClaudeDrawer.test.tsx`)_

## SKILLS-13.2 Slash-command palette

Implemented by `slashCommands.ts` (command registry) and `SlashPalette.tsx` (floating picker above the Composer textarea). Integration-level cases for the palette wired inside the Composer live in `12-claude-chat.md` as CHAT-12.3-10..13.

- **SLASH-13.2-01** ✅ **`/` alone triggers the palette** — the trigger predicate matches exactly `"/"` and patterns like `"/d"`, `"/diagram"`; it rejects `"/Diagram"`, `"/d "`, and `""`. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-02** ✅ **Trigger rejects mixed case, leading text, and trailing whitespace** — `"/D"`, `"foo/d"`, `"/ "` all return false. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-03** ✅ **Bare slash returns the full subcommand list** — `filterCommands("/")` returns all 8 `/kb` subcommands. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-04** ✅ **`/d` filters to diagram + document** — `filterCommands("/d")` returns the two subcommands whose IDs start with `"d"`. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-05** ✅ **`/v` filters to validate** — `filterCommands("/v")` returns only `validate`. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-06** ✅ **Off-pattern returns empty list** — `filterCommands("/xyz")` returns `[]`. _(unit: `slashCommands.test.ts`)_
- **SLASH-13.2-07** ✅ **Palette renders one option per command** — `SlashPalette` renders one `<li>` per entry in the `commands` prop. _(unit: `SlashPalette.test.tsx`)_
- **SLASH-13.2-08** ✅ **Highlight prop drives aria-selected** — the `<li>` at index `highlight` has `aria-selected="true"`; others have `aria-selected="false"`. _(unit: `SlashPalette.test.tsx`)_
- **SLASH-13.2-09** ✅ **mouseDown (not click) triggers onSelect** — `onMouseDown` on a palette item fires `onSelect` with the command; `onClick` alone is not the signal. _(unit: `SlashPalette.test.tsx`)_

## SKILLS-13.3 Skills sheet

Implemented by `SkillsSheet.tsx` (in-drawer overlay) and `SkillCard.tsx` (per-subcommand cards). The drawer's Skills header button + sheet→send wiring lives in `12-claude-chat.md` as CHAT-12.9-01/02 since those test the drawer surface.

- **SKILLS-13.3-01** ✅ **Sheet renders nothing when closed** — `SkillsSheet` returns `null` when `isOpen=false`. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-02** ✅ **One card per slash command rendered** — when open, `SkillsSheet` renders one `SkillCard` per entry in the `/kb` command registry. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-03** ✅ **Close button calls onClose** — clicking the × button in the sheet header fires `onClose`. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-04** ✅ **Escape calls onClose** — pressing Escape while the sheet is open fires `onClose`. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-05** ✅ **Backdrop mouseDown calls onClose** — mouseDown on the backdrop overlay fires `onClose`. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-06** ✅ **Clicking inside cards does NOT close the sheet** — mouseDown on the card area does not bubble to the backdrop handler. _(unit: `SkillsSheet.test.tsx`)_
- **SKILLS-13.3-07** ✅ **`/kb validate` card runs without an argument** — clicking Run on the validate card fires `onRun` with `"/kb validate"` (no trailing argument). _(unit: `SkillCard.test.tsx`)_
- **SKILLS-13.3-08** ✅ **Argument-style card disables Run when input is empty** — for subcommands that take a text argument (e.g. `create`, `document`), the Run button is disabled until the input field is non-empty. _(unit: `SkillCard.test.tsx`)_
- **SKILLS-13.3-09** ✅ **Argument-style card submits formatted text** — clicking Run fires `onRun` with `"/kb <subcommand> <argument>"` (space-separated, trimmed). _(unit: `SkillCard.test.tsx`)_
- **SKILLS-13.3-10** ✅ **`/kb edit` and `/kb transform` cards show "Pick a file…" trigger** — file-picker-style cards render a file-picker trigger button rather than a free-text input. _(unit: `SkillCard.test.tsx`)_
- **SKILLS-13.3-11** ✅ **Edit card disables Run until a file is picked** — Run is disabled while no file has been selected from the vault picker. _(unit: `SkillCard.test.tsx`)_

## SKILLS-13.4 Vault file picker

Implemented by `VaultFilePickerModal.tsx`. Walks the vault tree on the frontend via BFS over `tauriBridge.list(dir)`.

- **VAULTPICK-13.4-01** ✅ **`/kb edit` picker filters to `.json` files (recursive)** — the modal lists only `.json` files from the vault tree when opened for the `edit` subcommand. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-02** ✅ **Shows "No matching files" empty state** — when the vault contains no files of the requested extension, the modal shows the empty-state message. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-03** ✅ **Cancel returns null** — clicking the Cancel button resolves the picker promise with `null`. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-04** ✅ **Esc returns null** — pressing Escape resolves the picker promise with `null`. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-05** ✅ **Backdrop mouseDown returns null** — mouseDown on the backdrop resolves with `null`. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-06** ✅ **Clicking a file returns its vault-relative path** — selecting a file entry resolves the promise with the vault-relative path string. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-07** ✅ **`list()` rejection at root surfaces empty list** — if `tauriBridge.list(vaultRoot)` rejects, the modal shows the empty state without crashing. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-08** ✅ **Skips dot-directories** — `.archdesigner`, `.git`, and other dot-prefixed directories are not traversed or listed. _(unit: `VaultFilePickerModal.test.tsx`)_
- **VAULTPICK-13.4-09** ✅ **Renders nothing when closed** — the modal returns `null` when `isOpen=false`. _(unit: `VaultFilePickerModal.test.tsx`)_

## SKILLS-13.5 "Initialize with full template"

Splash + VaultSwitcher third action. Wires through `knowledgeBase.tsx` to `useChat().send("/kb init")` after the basic init completes.

- **SKILLS-13.5-01** ✅ **Splash third button calls `onInitializeWithTemplate`** — `UninitializedVaultSplash` renders a third CTA; clicking it fires the `onInitializeWithTemplate` callback. _(unit: `UninitializedVaultSplash.test.tsx`)_
- **SKILLS-13.5-02** ✅ **Action runs basic init, opens drawer, then sends `/kb init`** — the `onInitializeWithTemplate` handler in `knowledgeBase.tsx` calls `vaultConfigRepo.init`, then `openDrawer()`, then `chat.send("/kb init")`; all three are fired in order. _(unit: `knowledgeBase.initWithTemplate.test.tsx`)_

> VaultSwitcher dropdown's "Initialize with full template" entry shares the same parent-supplied callback. Coverage is via the parent's wiring test (`knowledgeBase.initWithTemplate.test.tsx`) rather than a switcher-specific case — the switcher renders a menu item and delegates without owning the logic.
