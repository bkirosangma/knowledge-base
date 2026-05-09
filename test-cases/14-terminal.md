# 14 Terminal

The embedded terminal surface — `zsh -i -l` PTY running `claude` in the active vault directory. MVP-3.5 surface — see `Features.md` §11.y for the feature catalogue.

> Mirrors §11.y of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## TERM-14.1 Lifecycle + bridge

Implemented by `useTerminalSession` + `TerminalSurface`. Rust side: `term_open` / `term_write` / `term_resize` / `term_close` in `src-tauri/src/term/`.

- **TERM-14.1-01** ✅ **skips open when vaultPath null** — `useTerminalSession` does not call `termOpen` when `vaultPath` is null. _(unit: `useTerminalSession.test.ts`)_
- **TERM-14.1-02** ✅ **skips open when term null** — `useTerminalSession` does not call `termOpen` when the xterm `Terminal` instance is null. _(unit: `useTerminalSession.test.ts`)_
- **TERM-14.1-03** ✅ **calls termOpen with rows/cols once both ready** — once both `vaultPath` and `term` are non-null, `termOpen` is called with the terminal's rows + cols. _(unit: `useTerminalSession.test.ts`)_
- **TERM-14.1-04** ✅ **re-opens on vaultPath change** — changing `vaultPath` causes `useTerminalSession` to call `termOpen` again with the new path. _(unit: `useTerminalSession.test.ts`)_
- **TERM-14.1-05** ✅ **renders the container with role="region"** — `TerminalSurface` renders a container element with `role="region"`. _(unit: `TerminalSurface.test.tsx`)_

## TERM-14.2 Drawer

Implemented by `TerminalDrawer`. Uses same bottom-anchored chrome as `ClaudeChatDrawer`.

- **TERM-14.2-01** ✅ **renders nothing when isOpen=false** — `TerminalDrawer` returns null/empty when `isOpen=false`. _(unit: `TerminalDrawer.test.tsx`)_
- **TERM-14.2-02** ✅ **renders region "Claude terminal drawer" when isOpen=true** — `TerminalDrawer` renders an element with `aria-label="Claude terminal drawer"` (or equivalent `role="region"` landmark) when `isOpen=true`. _(unit: `TerminalDrawer.test.tsx`)_
- **TERM-14.2-03** ✅ **Esc closes (calls close)** — pressing Escape while the drawer is open calls the `close` callback. _(unit: `TerminalDrawer.test.tsx`)_
- **TERM-14.2-04** ✅ **renders TerminalSurface inside** — when `isOpen=true`, `TerminalDrawer` renders `<TerminalSurface>` with the `vaultPath` prop. _(unit: `TerminalDrawer.test.tsx`)_

## TERM-14.3 Surface toggle command

Implemented by `registerSurfaceCommand.ts`. Registered into `CommandRegistry` under the Claude group.

- **TERM-14.3-01** ✅ **"Toggle Claude surface" registered with id 'claude.toggleSurface'** — the command appears in the registry with the expected ID and Claude group. _(unit: `registerSurfaceCommand.test.tsx`)_
- **TERM-14.3-02** ✅ **Run flips claude.surface from 'terminal' to 'chat'** — when current surface is `'terminal'`, running the command persists `'chat'` via `settingsStore`. _(unit: `registerSurfaceCommand.test.tsx`)_
- **TERM-14.3-03** ✅ **Run flips from 'chat' to 'terminal'** — when current surface is `'chat'`, running the command persists `'terminal'` via `settingsStore`. _(unit: `registerSurfaceCommand.test.tsx`)_
- **TERM-14.3-04** ✅ **setSurface from SurfaceContext is called with the toggled value** — the command calls `setSurface` from `useSurface()` with the new value after flipping. _(unit: `registerSurfaceCommand.test.tsx`)_

## TERM-14.4 ClaudeDrawer surface picker

Implemented by `ClaudeDrawer.tsx` reading `useSurface()` from `SurfaceContext`.

- **TERM-14.4-01** ✅ **renders TerminalDrawer when surface='terminal'** — `ClaudeDrawer` renders `<TerminalDrawer>` (not `<ClaudeChatDrawer>`) when `surface='terminal'` (the default). _(unit: `ClaudeDrawer.test.tsx`)_
- **TERM-14.4-02** ✅ **renders ClaudeChatDrawer when surface='chat'** — `ClaudeDrawer` renders `<ClaudeChatDrawer>` (not `<TerminalDrawer>`) when `surface='chat'`. _(unit: `ClaudeDrawer.test.tsx`)_
- **TERM-14.4-03** ✅ **skillBootstrap.justInstalled fires success SkillInstallToast** — when `useSkillBootstrap` returns `justInstalled=true`, the success-tone `SkillInstallToast` is rendered. _(unit: `ClaudeDrawer.test.tsx`)_
- **TERM-14.4-04** ✅ **skillBootstrap.error fires error SkillInstallToast** — when `useSkillBootstrap` returns a non-null `error`, the error-variant `SkillInstallToast` is rendered. _(unit: `ClaudeDrawer.test.tsx`; see also SKILLS-13.1-10)_

## TERM-14.5 Settings + key migration

Implemented by `settingsStore.ts` (frontend) + `src-tauri/src/settings/store.rs` (Rust serde alias).

- **SETTINGS-9-01** ✅ **getClaudeSurface defaults to 'terminal' when unset** — when `claude.surface` is absent from the store, `getClaudeSurface()` returns `'terminal'`. _(unit: `settingsStore.test.ts`)_
- **SETTINGS-9-02** ✅ **getClaudeDrawerHeight reads new claudeDrawer key when present** — `getClaudeDrawerHeight()` returns the value from `ui.claudeDrawer.height` when that key exists. _(unit: `settingsStore.test.ts`)_
- **SETTINGS-9-03** ✅ **getClaudeDrawerHeight defaults to 320 when claudeDrawer height is absent/zero** — `getClaudeDrawerHeight()` returns 320 when `ui.claudeDrawer.height` is absent or 0. _(unit: `settingsStore.test.ts`)_

> Rust-side serde alias coverage: the `claude_chat` → `claude_drawer` key migration is tested in `src-tauri/src/settings/store.rs` unit tests (cargo side).

## TERM-14.6 Footer cleanup + DrawerToggleButton rename

See also `test-cases/01-app-shell.md` §1.3 and §1.4 for the primary cases. Cases below track the MVP-3.5-specific changes.

- **SHELL-1.3-11** ✅ **Footer no longer renders ClaudeStatusLine** — after MVP-3.5 footer cleanup, `<ClaudeStatusLine>` is not rendered inside `<Footer>`; status is visible in the embedded terminal instead. _(unit: `Footer.test.tsx`)_
- **SHELL-1.4-21** ✅ **DrawerToggleButton renders with "Open Claude" label** — `<DrawerToggleButton>` (formerly `ChatToggleButton`) renders a button with an accessible name matching `/open claude/i`. _(unit: `DrawerToggleButton.test.tsx`)_
- **SHELL-1.4-22** ✅ **DrawerToggleButton pulses on streaming when surface='chat'** — `animate-pulse` is applied to the icon when `isStreaming && !isOpen && surface === 'chat'`. _(unit: `DrawerToggleButton.test.tsx`)_
- **SHELL-1.4-23** ✅ **DrawerToggleButton does NOT pulse when drawer is open even if streaming** — `animate-pulse` absent when `isOpen=true` regardless of streaming state. _(unit: `DrawerToggleButton.test.tsx`)_
- **SHELL-1.4-24** ✅ **DrawerToggleButton does NOT pulse when surface='terminal'** — `animate-pulse` absent when `surface='terminal'` even while streaming and drawer is closed. _(unit: `DrawerToggleButton.test.tsx`)_

## TERM-14.7 Vault-switch behavior

- **TERM-14.7-01** 🚫 **Real PTY in-place restart on vault change** — deferred to MVP-4 integration coverage. Rust-level `shell_escape` safety is covered by 3 cargo unit tests in `src-tauri/src/term/pty.rs`. End-to-end vault-switch-with-PTY-alive test needs `tauri-plugin-webdriver`.
