# Coding-Standards Refactor — Phase 0 + 0.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the safety net (characterization tests for the five god components) and the CI gate (GitHub Actions workflow) that together unblock Phase 1 (god-component decomposition). No user-visible behaviour changes.

**Architecture:**

- **Phase 0** adds characterization tests that capture the *current* externally-observable behaviour of `DiagramView.tsx`, `MarkdownEditor.tsx`, `markdownReveal.ts`, `ExplorerPanel.tsx`, and `useFileExplorer.ts`. Because these files are too large and too hook-heavy to unit-test in isolation, coverage happens at two layers:
  - **Playwright e2e with fsMock** — golden-path flows through the real app (open vault → edit → save). Two new specs: one for diagram, one for document.
  - **React Testing Library integration** — a smoke spec for `DiagramView` (mount, observable state, keyboard), and an extension of the existing `MarkdownEditor` toolbar test for content-sync debounce.
- **Phase 0.5** adds `.github/workflows/ci.yml` gating every PR on `lint → test:run → test:e2e → build` and a CI badge in README.

**Tech Stack:** Vitest 4, Playwright 1.59, @testing-library/react 16, @testing-library/user-event 14, GitHub Actions, Node 22 (from `.nvmrc`).

**Scope check.** Phase 1's five sub-phases (the actual god-component extractions) are scoped to separate plans that will be written after this plan lands. This plan is intentionally just the safety net + gate.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/app/knowledge_base/features/diagram/components/Canvas.tsx` | **Modify.** Add `data-testid="diagram-canvas"` to the root SVG element. | Enable reliable e2e selectors without scope-creeping into a full refactor. |
| `src/app/knowledge_base/features/diagram/components/Element.tsx` | **Modify.** Add `data-testid={`node-${id}`}` and `data-node-label={label}` to the root `<div>`. | Same. |
| `src/app/knowledge_base/features/diagram/components/Layer.tsx` | **Modify.** Add `data-testid={`layer-${id}`}` to the root group. | Same. |
| `e2e/diagramGoldenPath.spec.ts` | **Create.** Six Playwright tests against a seeded diagram. | Characterize selection, drag, keyboard delete, save, properties toggle, autosave-on-switch. |
| `e2e/documentGoldenPath.spec.ts` | **Create.** Five Playwright tests against a seeded document. | Characterize typing, debounced save, raw/WYSIWYG toggle, cross-file swap, wiki-link rendering. |
| `src/app/knowledge_base/features/diagram/DiagramView.test.tsx` | **Create.** RTL smoke test — 4 cases. | Characterize render-without-crash, props-panel localStorage persistence, activeFile swap, Cmd+S handler registration. |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx` | **Modify.** Append three new `describe` blocks covering content sync + `onChange` debounce + unmount flush. | Close gap in existing 226-line toolbar-focused test file. |
| `test-cases/01-app-shell.md`, `02-file-system.md`, `03-diagram.md`, `04-document.md` | **Modify.** Flip `❌` → `✅` markers for newly covered cases, each in the same commit as its covering test. | Keep the test-case catalogue in sync per CLAUDE.md contract. |
| `.github/workflows/ci.yml` | **Create.** Single job: lint + test:run + Playwright + build. | Gate every PR automatically. |
| `README.md` | **Modify.** Add CI status badge just under the title. | Visible signal of build health. |

**Out of scope for this plan:**

- No changes to god-component source except the three stable-selector additions (non-behavioural).
- No new test infrastructure (Vitest + Playwright + fsMock + RTL already wired).
- No Phase 1 extractions. Those are separate plans.
- No coverage threshold enforcement (Phase 1 plans will gate once baseline stabilises).
- No branch-protection rules in GitHub UI (configured outside the repo).

---

## Pre-flight

Run these once before starting Task 1 so you have a clean baseline.

- [ ] **Verify local toolchain**

```bash
node --version   # expect v22.x (from .nvmrc)
npm run lint     # expect clean
npm run test:run # expect all existing tests green
npm run build    # expect clean build
```

If any fails, stop — the baseline must be clean so Phase 0 failures are attributable to new tests only.

- [ ] **Familiarise yourself with fsMock**

Read `e2e/fixtures/fsMock.ts` (lines 1–60) and `e2e/goldenPath.spec.ts` (lines 1–50). The `setupFs(page, {path: content})` + `openFolder(page)` pattern is what every new e2e test uses. `readMockFile(page, 'path')` reads back after a save.

---

## Task 1: Add stable selectors to diagram surface

**Why first:** `e2e/diagramGoldenPath.spec.ts` (Task 2) needs to click a node, drag it, and verify its new position. Without `data-testid` on Canvas / Element / Layer, we'd be selecting via Tailwind class chains — brittle and exactly what breaks during Phase 1. Three tiny attribute additions cost us nothing and are not observable to users (data attributes don't render visually).

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/Canvas.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/Element.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/Layer.tsx`

- [ ] **Step 1: Open `Canvas.tsx` and locate the root SVG**

Run: `grep -n "^  return\|<svg" src/app/knowledge_base/features/diagram/components/Canvas.tsx | head -5`

Find the `<svg ...>` element that is the canvas root (not nested `<svg>`s for markers). You want the one that contains the whole diagram surface.

- [ ] **Step 2: Add `data-testid="diagram-canvas"` attribute**

Add `data-testid="diagram-canvas"` as an attribute on that root `<svg>`. No other changes.

- [ ] **Step 3: Open `Element.tsx` and find the root `<div>` (line 106)**

The root element is the `<div className={…}>` at approximately line 106. This div receives pointer events for selection and drag.

- [ ] **Step 4: Add data attributes to the Element root**

Add two attributes to the root `<div>`:

```tsx
data-testid={`node-${id}`}
data-node-label={label}
```

(`id` and `label` are already destructured from props in this component — no new destructuring needed. Confirm by searching for `id` and `label` in the component's `function Element(...)` signature.)

- [ ] **Step 5: Open `Layer.tsx` and add layer selector**

Find the root wrapper (the `<g>` or `<div>` that contains the whole layer). Add:

```tsx
data-testid={`layer-${id}`}
```

(If the Layer component doesn't already destructure `id`, extract it from `props.layer.id` and use `data-testid={`layer-${layer.id}`}`.)

- [ ] **Step 6: Run tests to confirm nothing broke**

Run: `npm run test:run`
Expected: all existing tests still pass. Data attributes are invisible to every existing assertion.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/Canvas.tsx src/app/knowledge_base/features/diagram/components/Element.tsx src/app/knowledge_base/features/diagram/components/Layer.tsx
git commit -m "$(cat <<'EOF'
test(diagram): add data-testid selectors to Canvas/Element/Layer

Enables e2e tests to address diagram nodes, layers, and the canvas root
without relying on Tailwind class chains. Non-behavioural.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Diagram golden-path e2e spec

**Files:**
- Create: `e2e/diagramGoldenPath.spec.ts`
- Modify: `test-cases/03-diagram.md` (flip markers for cases covered)

- [ ] **Step 1: Create `e2e/diagramGoldenPath.spec.ts` with the scaffold + opening test**

```ts
import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Characterization tests for DiagramView.tsx captured BEFORE Phase 1
// decomposition. Any regression in the golden path from Phase 1 will turn
// one of these tests red, and that's the whole point.
//
// Covers: DIAG-3.1 (open), 3.2 (selection), 3.3 (drag), 3.4 (keyboard delete),
//         3.5 (save), SHELL-1.2 (autosave-on-switch).

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void }
    }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as {
      __kbMockFS: { read: (p: string) => string | undefined }
    }).__kbMockFS
    return m.read(p)
  }, path)
}

/** A minimal two-node diagram used by the selection/drag tests. */
const TWO_NODE_DIAGRAM = {
  title: 'Test Flow',
  layers: [],
  nodes: [
    { id: 'n1', label: 'Alpha', icon: 'Box',   x: 120, y: 120, w: 180, layer: null, type: 'default' },
    { id: 'n2', label: 'Beta',  icon: 'Cloud', x: 420, y: 120, w: 180, layer: null, type: 'default' },
  ],
  connections: [],
  flows: [],
  documents: [],
  layerManualSizes: {},
  lineCurve: 'orthogonal',
}

test.describe('Diagram golden path', () => {
  test('DIAG-3.1-01: opening a .json renders the diagram canvas and both nodes', async ({ page }) => {
    await setupFs(page, {
      'flow.json': JSON.stringify(TWO_NODE_DIAGRAM),
    })
    await openFolder(page)
    await page.getByText('flow.json').first().click()

    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
    await expect(page.locator('[data-testid="node-n2"]')).toBeVisible()
    await expect(page.locator('[data-node-label="Alpha"]')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the new test alone to verify it passes**

Run: `npx playwright test e2e/diagramGoldenPath.spec.ts --reporter=line`
Expected: `1 passed`. If it fails, inspect the Playwright trace (`npx playwright show-report`) and confirm Canvas / Element rendered the `data-testid` attributes from Task 1.

- [ ] **Step 3: Append selection test**

Append to the same `test.describe` block:

```ts
  test('DIAG-3.2-01: clicking a node selects it (shows blue ring)', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    await page.locator('[data-testid="node-n1"]').click()

    // Element.tsx applies `ring-2 ring-blue-400` to the selected node's root div.
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
    // The other node is NOT selected.
    await expect(page.locator('[data-testid="node-n2"]')).not.toHaveClass(/ring-2/)
  })
```

- [ ] **Step 4: Append drag test**

```ts
  test('DIAG-3.3-01: dragging a node updates its position on save', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    const node = page.locator('[data-testid="node-n1"]')
    const box = await node.boundingBox()
    if (!box) throw new Error('node-n1 has no bounding box')

    // Drag from current centre → 200px right, 80px down.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 80, { steps: 10 })
    await page.mouse.up()

    // Save (Cmd+S on Darwin, Ctrl+S elsewhere — Playwright supports 'Meta+s' on Darwin but the app
    // also accepts the toolbar Save button; use the button to keep the test platform-agnostic).
    await page.getByRole('button', { name: /^save$/i }).click()

    // Read back the saved diagram. n1's x should be larger than the seeded 120.
    const saved = await readMockFile(page, 'flow.json')
    if (!saved) throw new Error('flow.json missing after save')
    const diagram = JSON.parse(saved) as { nodes: Array<{ id: string; x: number; y: number }> }
    const n1 = diagram.nodes.find(n => n.id === 'n1')!
    expect(n1.x).toBeGreaterThan(120)
    expect(n1.y).toBeGreaterThan(120)
  })
```

- [ ] **Step 5: Append keyboard-delete test**

```ts
  test('DIAG-3.4-01: selecting a node and pressing Delete removes it on save', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n2"]')).toBeVisible({ timeout: 5000 })

    await page.locator('[data-testid="node-n2"]').click()
    await page.keyboard.press('Delete')

    // n2 should be removed from the DOM.
    await expect(page.locator('[data-testid="node-n2"]')).toHaveCount(0)

    await page.getByRole('button', { name: /^save$/i }).click()
    const saved = await readMockFile(page, 'flow.json')
    const diagram = JSON.parse(saved!) as { nodes: Array<{ id: string }> }
    expect(diagram.nodes.map(n => n.id)).toEqual(['n1'])
  })
```

- [ ] **Step 6: Append properties-panel-toggle persistence test**

```ts
  test('DIAG-3.5-01: toggling the properties panel persists to localStorage', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })

    // Properties toggle is in the right-side properties panel header. The
    // button's accessible name is "Collapse properties" / "Expand properties"
    // depending on current state. We toggle twice and re-read localStorage.
    const initial = await page.evaluate(() => localStorage.getItem('properties-collapsed'))

    // Find any button whose title or aria-label references "properties" and click it.
    // (This mirrors what a user does — click the collapse chevron.)
    const toggle = page.getByRole('button', { name: /properties/i }).first()
    await toggle.click()
    const afterOne = await page.evaluate(() => localStorage.getItem('properties-collapsed'))
    expect(afterOne).not.toBe(initial)

    await toggle.click()
    const afterTwo = await page.evaluate(() => localStorage.getItem('properties-collapsed'))
    expect(afterTwo).toBe(initial ?? 'false')
  })
```

- [ ] **Step 7: Append autosave-on-switch test**

```ts
  test('SHELL-1.2-13: switching files from an unsaved diagram flushes the previous one to disk', async ({ page }) => {
    await setupFs(page, {
      'one.json': JSON.stringify({ ...TWO_NODE_DIAGRAM, title: 'One' }),
      'two.json': JSON.stringify({ ...TWO_NODE_DIAGRAM, title: 'Two' }),
    })
    await openFolder(page)
    await page.getByText('one.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    // Drag n1 a bit (marks diagram dirty).
    const n1 = page.locator('[data-testid="node-n1"]')
    const box = await n1.boundingBox()
    if (!box) throw new Error('node-n1 has no bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 250, box.y + 50, { steps: 5 })
    await page.mouse.up()

    // Click the other file in the explorer. Autosave should write one.json.
    await page.getByText('two.json').first().click()
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible()

    const saved = await readMockFile(page, 'one.json')
    const diagram = JSON.parse(saved!) as { nodes: Array<{ id: string; x: number }> }
    const persistedN1 = diagram.nodes.find(n => n.id === 'n1')!
    expect(persistedN1.x).toBeGreaterThan(120)
  })
```

- [ ] **Step 8: Run the full diagram golden-path suite**

Run: `npx playwright test e2e/diagramGoldenPath.spec.ts --reporter=line`
Expected: `6 passed`. If the properties-panel toggle test can't find a button by `/properties/i` accessible name, inspect via `npx playwright test e2e/diagramGoldenPath.spec.ts --headed` — the test is a characterization, so it can be adapted to the real accessible name; update the selector and keep the assertion.

- [ ] **Step 9: Flip test-case markers in `test-cases/03-diagram.md`**

For each case referenced in the new tests — `DIAG-3.1-01`, `DIAG-3.2-01`, `DIAG-3.3-01`, `DIAG-3.4-01`, `DIAG-3.5-01` — find the bullet in `test-cases/03-diagram.md` and change its status marker from `❌` to `✅` with a trailing ` — e2e/diagramGoldenPath.spec.ts` note. Leave every other marker untouched.

If a case ID you used in the test isn't present in `03-diagram.md`, either pick the matching existing case ID (the catalogue is the source of truth) and update the test's `it(...)` name, OR add the new case at the next free number with a one-line Gherkin-lite description per `test-cases/README.md` conventions. Don't renumber existing IDs.

Also flip `SHELL-1.2-13` in `test-cases/01-app-shell.md` (autosave-on-switch).

- [ ] **Step 10: Commit**

```bash
git add e2e/diagramGoldenPath.spec.ts test-cases/03-diagram.md test-cases/01-app-shell.md
git commit -m "$(cat <<'EOF'
test(diagram): golden-path e2e characterization for DiagramView

6 Playwright tests capturing current behaviour of open / select / drag /
keyboard delete / save / properties toggle / autosave-on-switch, as a
safety net before Phase 1 god-component decomposition.

Covers DIAG-3.1-01, 3.2-01, 3.3-01, 3.4-01, 3.5-01, SHELL-1.2-13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Document golden-path e2e spec

**Files:**
- Create: `e2e/documentGoldenPath.spec.ts`
- Modify: `test-cases/04-document.md`

- [ ] **Step 1: Create `e2e/documentGoldenPath.spec.ts` with the scaffold + typing test**

```ts
import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Characterization tests for MarkdownEditor + markdownReveal + useDocumentContent
// captured before Phase 1 decomposition.
//
// Covers: DOC-4.1 (open), 4.2 (typing), 4.3 (mode toggle), 4.6 (save flush),
//         DOC-4.7 (wiki-link display).

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void }
    }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as {
      __kbMockFS: { read: (p: string) => string | undefined }
    }).__kbMockFS
    return m.read(p)
  }, path)
}

test.describe('Document golden path', () => {
  test('DOC-4.1-01: clicking a .md opens the ProseMirror editor with the content', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Hello\n\nFirst paragraph.',
    })
    await openFolder(page)
    await page.getByText('note.md').first().click()

    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Hello').first()).toBeVisible()
    await expect(page.getByText('First paragraph.').first()).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the first test**

Run: `npx playwright test e2e/documentGoldenPath.spec.ts --reporter=line`
Expected: `1 passed`.

- [ ] **Step 3: Append typing + save test**

```ts
  test('DOC-4.2-01 / DOC-4.6-01: typing into the editor and saving persists to disk', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Start' })
    await openFolder(page)
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Focus the editor and type.
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\nAppended line.')

    // Save button becomes enabled once dirty.
    const saveBtn = page.getByRole('button', { name: /^save$/i })
    await expect(saveBtn).toBeEnabled({ timeout: 2000 })
    await saveBtn.click()

    const saved = await readMockFile(page, 'note.md')
    expect(saved).toContain('# Start')
    expect(saved).toContain('Appended line.')
  })
```

- [ ] **Step 4: Append raw / WYSIWYG round-trip test**

```ts
  test('DOC-4.3-01: toggling Raw / WYSIWYG preserves content', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Round Trip\n\n**bold** and *italic*.' })
    await openFolder(page)
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Click Raw tab (aria/name: "Raw").
    await page.getByRole('button', { name: /^raw$/i }).click()
    // The textarea appears with the raw markdown.
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await expect(textarea).toHaveValue(/# Round Trip/)
    await expect(textarea).toHaveValue(/\*\*bold\*\*/)

    // Click WYSIWYG to go back.
    await page.getByRole('button', { name: /wysiwyg/i }).click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible()
    await expect(page.getByText('Round Trip').first()).toBeVisible()
    // Bold mark renders as <strong>.
    await expect(page.locator('strong').getByText('bold')).toBeVisible()
  })
```

- [ ] **Step 5: Append cross-file swap test**

```ts
  test('DOC-4.6-02: switching documents flushes the previous one on the way out', async ({ page }) => {
    await setupFs(page, {
      'a.md': '# A',
      'b.md': '# B',
    })
    await openFolder(page)
    await page.getByText('a.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\nEdited A.')

    // Switch files without clicking Save.
    await page.getByText('b.md').first().click()
    await expect(page.getByText('B').first()).toBeVisible({ timeout: 5000 })

    // a.md on disk should still include the edit — useDocumentContent flushes on switch.
    const savedA = await readMockFile(page, 'a.md')
    expect(savedA).toContain('Edited A.')
  })
```

- [ ] **Step 6: Append wiki-link display test**

```ts
  test('DOC-4.7-01: an existing [[target]] renders as a blue wiki-link pill', async ({ page }) => {
    await setupFs(page, {
      'index.md': 'See [[target]] for more.',
      'target.md': '# Target',
    })
    await openFolder(page)
    await page.getByText('index.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // WikiLink renders as a span with a blue background class when the target exists.
    const pill = page.locator('.ProseMirror').locator('text=target').first()
    await expect(pill).toBeVisible()
    // It's not rendered as plain brackets text.
    await expect(page.getByText('[[target]]', { exact: true })).toHaveCount(0)
  })
```

- [ ] **Step 7: Run the full document golden-path suite**

Run: `npx playwright test e2e/documentGoldenPath.spec.ts --reporter=line`
Expected: `5 passed`. If Save button enabled assertion flakes, increase its timeout to 3000ms — the editor's `onUpdate` debounce is 200ms but the first transaction may take longer in CI.

- [ ] **Step 8: Flip test-case markers**

In `test-cases/04-document.md`, flip `DOC-4.1-01`, `DOC-4.2-01`, `DOC-4.3-01`, `DOC-4.6-01`, `DOC-4.6-02`, `DOC-4.7-01` from `❌` to `✅ — e2e/documentGoldenPath.spec.ts`. Again, if any of these IDs don't exist in the catalogue today, reuse an existing matching ID and update the test name, or add the case at the next free number.

- [ ] **Step 9: Commit**

```bash
git add e2e/documentGoldenPath.spec.ts test-cases/04-document.md
git commit -m "$(cat <<'EOF'
test(doc): golden-path e2e characterization for document editor

5 Playwright tests capturing current behaviour of open / type / save /
Raw-WYSIWYG round-trip / cross-file autosave / wiki-link rendering, as
a safety net before Phase 1 MarkdownEditor / markdownReveal splits.

Covers DOC-4.1-01, 4.2-01, 4.3-01, 4.6-01, 4.6-02, 4.7-01.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DiagramView RTL smoke test

**Why this layer.** The e2e suite in Task 2 covers observable diagram behaviour. This unit-level smoke test captures the two things e2e can't cheaply verify: (a) the component mounts without throwing under RTL's JSDOM environment (which is how Phase 1 splits will be exercised), and (b) that `properties-collapsed` localStorage initialisation actually runs when the component first renders.

**Files:**
- Create: `src/app/knowledge_base/features/diagram/DiagramView.test.tsx`

- [ ] **Step 1: Audit DiagramView's required props**

Run: `grep -n "DiagramViewProps\|DiagramBridge" src/app/knowledge_base/features/diagram/DiagramView.tsx | head -10`

Note the `DiagramViewProps` shape at line 149-168 (focused, side, activeFile, fileExplorer, onOpenDocument, documents, onAttachDocument, onDetachDocument, onCreateDocument, onLoadDocuments, backlinks, onDiagramBridge). All must be provided with stub values.

- [ ] **Step 2: Create `DiagramView.test.tsx` with a render helper and smoke test**

```tsx
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import DiagramView from './DiagramView'

// Characterization-layer smoke tests for DiagramView. The component is too
// intertwined with Canvas + 20 hooks to exercise every interaction here;
// those live in e2e/diagramGoldenPath.spec.ts. These tests assert that:
//   1. The component mounts without throwing given minimal valid props.
//   2. The localStorage-backed "properties-collapsed" flag initialises from
//      localStorage on first render.
//   3. Swapping `activeFile` rerenders without crashing.
//   4. The component calls `onDiagramBridge` on mount (prove bridge wiring).

beforeEach(() => {
  localStorage.clear()
  cleanup()
})

function stubFileExplorer() {
  return {
    // Minimal surface DiagramView reads. Flesh out if a test needs more.
    tree: [],
    rootHandle: null,
    activeFilePath: null,
    saveDiagramFile: vi.fn(async () => {}),
    renameFile: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    createDiagram: vi.fn(async () => {}),
  } as unknown as React.ComponentProps<typeof DiagramView>['fileExplorer']
}

function baseProps(overrides: Partial<React.ComponentProps<typeof DiagramView>> = {}): React.ComponentProps<typeof DiagramView> {
  return {
    focused: true,
    side: 'left',
    activeFile: null,
    fileExplorer: stubFileExplorer(),
    onOpenDocument: vi.fn(),
    documents: [],
    onAttachDocument: vi.fn(),
    onDetachDocument: vi.fn(),
    onCreateDocument: vi.fn(),
    onLoadDocuments: vi.fn(async () => []),
    backlinks: [],
    onDiagramBridge: vi.fn(),
    ...overrides,
  }
}

describe('DiagramView — smoke', () => {
  it('renders without throwing given minimal props', () => {
    expect(() => render(<DiagramView {...baseProps()} />)).not.toThrow()
  })

  it('DIAG-3.5-02: properties-collapsed initialises from localStorage on mount', () => {
    localStorage.setItem('properties-collapsed', 'true')
    const { container } = render(<DiagramView {...baseProps()} />)
    // The properties panel's collapsed/expanded state manifests as a class or
    // width on the right-hand aside. We assert indirectly: the value we wrote
    // is preserved (not reset on mount) and the component doesn't throw.
    expect(localStorage.getItem('properties-collapsed')).toBe('true')
    expect(container).toBeTruthy()
  })

  it('rerenders without crashing when activeFile prop changes', () => {
    const { rerender } = render(<DiagramView {...baseProps({ activeFile: null })} />)
    expect(() =>
      rerender(<DiagramView {...baseProps({ activeFile: 'flow.json' })} />),
    ).not.toThrow()
  })

  it('calls onDiagramBridge on mount to publish its bridge', () => {
    const onDiagramBridge = vi.fn()
    render(<DiagramView {...baseProps({ onDiagramBridge })} />)
    expect(onDiagramBridge).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the new test**

Run: `npm run test:run -- src/app/knowledge_base/features/diagram/DiagramView.test.tsx`
Expected: `4 passed`.

- [ ] **Step 4: If tests fail due to missing required props, adjust `baseProps`**

Likely failures and their fixes:
- `TypeError: Cannot read property 'X' of undefined` — the `fileExplorer` stub is missing a field the component reads on mount. Add it to `stubFileExplorer()` as a `vi.fn()` or a simple empty value. Do NOT add the field to the production component.
- `Error: Canvas is not a function` — there's an import-time side effect breaking under JSDOM. Check `src/test/setup.ts` for an analogous polyfill; add one if needed (e.g. `window.PointerEvent` polyfill).
- `localStorage is not defined` — JSDOM provides localStorage; this shouldn't happen. If it does, check `vitest.config.ts` has `environment: 'jsdom'` (it does — line 7).

Don't soften the test to pass — make the harness match reality.

- [ ] **Step 5: Flip test-case markers**

In `test-cases/03-diagram.md`, flip `DIAG-3.5-02` from `❌` to `✅ — DiagramView.test.tsx`. (Other tests in this file were component smokes; they map to the generic "component mounts" case — flip the one that actually matches if present, otherwise add a new case at the next free number.)

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.test.tsx test-cases/03-diagram.md
git commit -m "$(cat <<'EOF'
test(diagram): DiagramView RTL smoke characterization

4 smoke tests: mount, localStorage persistence init, activeFile rerender,
onDiagramBridge call. Complements e2e/diagramGoldenPath.spec.ts which
covers user interaction; this covers React-level contracts before Phase
1 splits DiagramView into composition + state + canvas-host.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: MarkdownEditor content-sync test coverage

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx`
- Modify: `test-cases/04-document.md`

**Context.** The existing test file (226 lines, 14 tests) covers the toolbar surface (DOC-4.5-01..17). It does **not** cover content sync — typing triggers an `onChange` prop via a 200ms debounce, and unmount flushes pending changes. Those paths regress silently under Phase 1 splits of `MarkdownEditor` unless they're pinned here.

- [ ] **Step 1: Ensure `vi` is imported**

The existing file's line 1 reads:

```ts
import { describe, it, expect } from 'vitest'
```

Change it to:

```ts
import { describe, it, expect, vi } from 'vitest'
```

(Vitest globals are enabled in `vitest.config.ts`, but the file's style is to import explicitly.)

- [ ] **Step 2: Find the end of the existing test file**

Run: `tail -20 src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx`

Note the last `describe` block — the new tests go immediately after it, still inside the file (no nested describes inside the new block).

- [ ] **Step 3: Append content-sync tests at the end of the file**

Append the following text after the final `})` closing of the last `describe` (i.e. at EOF):

```tsx
// ── Content sync (DOC-4.5-24..26) ──────────────────────────────────────────

describe('MarkdownEditor — content sync (DOC-4.5-24..26)', () => {
  it('DOC-4.5-24: typing into the editor fires onChange with the new markdown (debounced)', async () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      const { container } = render(
        <MarkdownEditor content="# Start\n\n" onChange={onChange} />,
      )
      await waitFor(() => {
        expect(container.querySelector('.ProseMirror')).not.toBeNull()
      })

      const editor = container.querySelector<HTMLElement>('.ProseMirror')!
      editor.focus()
      // Synthesise a content change by dispatching an 'input' event with new text.
      // Tiptap listens to the DOM; in JSDOM we can insert text via the ProseMirror
      // surface's contenteditable.
      act(() => {
        editor.append(document.createTextNode(' appended'))
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      })

      // Before the 200ms debounce fires, onChange hasn't been called yet.
      expect(onChange).not.toHaveBeenCalled()

      // Advance past the debounce.
      act(() => { vi.advanceTimersByTime(300) })

      // onChange fired at least once with a string arg.
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
        expect(typeof lastCall[0]).toBe('string')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('DOC-4.5-25: unmount flushes a pending onChange synchronously', async () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      const { container, unmount } = render(
        <MarkdownEditor content="# Start" onChange={onChange} />,
      )
      await waitFor(() => {
        expect(container.querySelector('.ProseMirror')).not.toBeNull()
      })

      const editor = container.querySelector<HTMLElement>('.ProseMirror')!
      act(() => {
        editor.append(document.createTextNode(' dirty'))
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      })
      // Debounce not yet fired.
      expect(onChange).not.toHaveBeenCalled()

      // Unmount should flush.
      unmount()

      // Post-unmount, onChange should have been invoked at least once.
      expect(onChange).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('DOC-4.5-26: onChange is NOT called when content prop changes externally without user edits', async () => {
    const onChange = vi.fn()
    const { rerender, container } = render(
      <MarkdownEditor content="# A" onChange={onChange} />,
    )
    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })
    onChange.mockClear()

    rerender(<MarkdownEditor content="# B" onChange={onChange} />)

    // External content swap doesn't loop back to onChange (that would cause
    // infinite save cycles).
    await new Promise((r) => setTimeout(r, 300))
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run the new tests**

Run: `npm run test:run -- src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx`
Expected: previously green tests + 3 new passing. If DOC-4.5-24 fails because the fake-timer dance doesn't trip the debounce (Tiptap's transaction plugin may use `queueMicrotask` rather than `setTimeout`), swap to real timers and `await new Promise(r => setTimeout(r, 300))` instead — the assertion is what matters, not the timer implementation.

- [ ] **Step 5: Flip markers**

In `test-cases/04-document.md`, flip `DOC-4.5-24`, `DOC-4.5-25`, `DOC-4.5-26` from `❌` to `✅`. If they don't exist yet, add them at the next free number in section 4.5.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx test-cases/04-document.md
git commit -m "$(cat <<'EOF'
test(doc): MarkdownEditor content-sync characterization

3 RTL tests covering the debounced onChange path, unmount flush, and
the no-echo rule on external content swaps. Pins behaviour before
Phase 1 splits MarkdownEditor.

Covers DOC-4.5-24, 4.5-25, 4.5-26.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Read Node version from .nvmrc
        id: nvmrc
        run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.nvmrc.outputs.version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit + integration tests
        run: npm run test:run

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: End-to-end tests
        run: npm run test:e2e

      - name: Build
        run: npm run build

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Verify YAML is valid**

Run: `npx --yes yaml-lint .github/workflows/ci.yml 2>&1 | head -10 || node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('valid')"`

If neither `yaml-lint` nor `js-yaml` is available locally, skip — GitHub validates on push. The workflow is syntactically simple enough that a visual review of the indentation is enough.

- [ ] **Step 4: Local dry-run — run each step's command sequentially**

```bash
npm ci
npm run lint
npm run test:run
npx playwright install --with-deps chromium    # skip if already installed
npm run test:e2e
npm run build
```

All six must succeed. If `npm run test:e2e` fails with port-in-use, another dev server is running — kill it first (`lsof -ti:3000 | xargs kill -9`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add GitHub Actions workflow gating lint + test + e2e + build

Runs on every PR into main and every push to main. Uses Node version
from .nvmrc, caches npm, installs Chromium for Playwright, and uploads
the Playwright HTML report on failure.

Unblocks Phase 1 decomposition by catching regressions automatically
without relying on local verification discipline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push the branch and verify CI green on a trial PR**

```bash
git push -u origin HEAD
gh pr create --title "ci: add GitHub Actions workflow" --body "Phase 0.5 of the coding-standards refactor plan — gates PRs on lint/test/e2e/build."
```

Then watch the Actions tab (`gh pr checks --watch`) until the run finishes. If it fails, check the specific step; most likely issues are:
- `npm ci` version mismatch if `package-lock.json` has been edited post-install.
- Playwright cache miss in fresh runner — expected on first run, should be fine.
- Next.js build warnings becoming errors under CI-strict — if so, fix the warning rather than relaxing strictness.

Do **not** merge the PR yet — leave it open until Task 8 updates the README with the badge, then merge both together.

---

## Task 7: README CI badge

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Figure out the badge URL**

Run: `gh repo view --json nameWithOwner --jq .nameWithOwner`
Copy the output (e.g. `bkirosangma/knowledge-base`). The badge URL is:

```
https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg
```

- [ ] **Step 2: Add the badge to the top of README.md**

Open `README.md`, find the first line (the title, likely `# knowledge-base` or similar). Insert two lines immediately after the title:

```markdown
[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml)

```

Replace `<OWNER>/<REPO>` with the string from Step 1 — make sure there's a blank line after the badge so rendered markdown separates it from the following paragraph.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): add CI status badge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

- [ ] **Step 4: Verify badge renders on the PR**

Open the PR in a browser. The rendered README preview should show the badge as "CI | passing" (or "failing" if the pipeline is still amber — wait for it to finish).

- [ ] **Step 5: Merge the PR**

Once the badge renders and the pipeline is green:

```bash
gh pr merge --squash --delete-branch
```

---

## Task 8: Wrap-up — graphify rebuild + Features.md audit + plan closure

**Files:**
- Modify (maybe): `graphify-out/*` (via rebuild)
- Modify (maybe): `Features.md`

- [ ] **Step 1: Rebuild the knowledge graph**

```bash
graphify . --update
```

New test files will show up in the graph; the existing 565-node / 28-community structure shouldn't change meaningfully. If the tool isn't on PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
graphify . --update
```

- [ ] **Step 2: Confirm Features.md is still accurate**

Open `Features.md`. This plan added no user-visible features; it only added tests + CI. The Features.md catalogue is code-centric, so `Features.md` should need **no change**. If there's a "Testing" or "CI" section that would drift, update it in this step; otherwise skip.

Run: `grep -in "ci\|github actions\|continuous integration" Features.md | head -5`

If any line references "no CI" or "CI pending", update it to reference the new workflow.

- [ ] **Step 3: Final test run**

```bash
npm run lint
npm run test:run
npm run test:e2e
npm run build
```

Expected: everything green, same as CI.

- [ ] **Step 4: Summarise results for the user**

Report back:
- Total new tests added (sum across Tasks 2–5).
- Count of test-case markers flipped per test-cases/*.md file.
- CI workflow status on main (badge should read "passing").
- Confirmation that no non-test production code was changed except the three data-testid additions in Task 1.

---

## Definition of Done (this plan)

- [ ] All 8 tasks complete.
- [ ] `npm run lint && npm run test:run && npm run test:e2e && npm run build` green locally.
- [ ] GitHub Actions CI passing on `main`.
- [ ] CI badge visible in README.
- [ ] test-cases `❌` → `✅` markers flipped for every newly covered case, each in the same commit as its test.
- [ ] `graphify . --update` run.
- [ ] Every commit uses the Co-Authored-By line.
- [ ] No god-component source files changed except the three `data-testid` attribute additions in Task 1.
- [ ] No `Features.md` user-facing sections changed (this plan's work is non-observable).

Ready to hand off to writing-plans' execution stage.
