# Vitest + RTL + Playwright Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure Vitest + React Testing Library for unit/component tests and Playwright for E2E tests, with a passing example test for each.

**Architecture:** Vitest runs via Vite's transform pipeline (ESM-native, no Babel needed), using jsdom for browser simulation. Playwright runs Next.js dev server automatically and drives real Chromium. The two test suites are kept completely separate — `src/**/*.test.ts(x)` for Vitest, `e2e/**/*.spec.ts` for Playwright.

**Tech Stack:** Vitest 3, @vitejs/plugin-react, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @playwright/test, jsdom, @vitest/coverage-v8

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `vitest.config.ts` | Create | Vitest runner configuration (jsdom, setup file, path alias) |
| `src/test/setup.ts` | Create | Import jest-dom matchers for all tests |
| `tsconfig.test.json` | Create | Extends main tsconfig; adds `vitest/globals` types for editor support |
| `playwright.config.ts` | Create | Playwright runner configuration (baseURL, webServer, Chromium) |
| `e2e/app.spec.ts` | Create | Playwright smoke test verifying the app loads |
| `src/app/knowledge_base/features/diagram/utils/gridSnap.test.ts` | Create | Vitest unit test for `snapToGrid` (proves setup works end-to-end) |
| `package.json` | Modify | Add test scripts and devDependencies |

---

## Task 1: Install Vitest and RTL dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @vitest/coverage-v8 \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: no peer-dep errors. `package.json` devDependencies now lists all seven packages.

- [ ] **Step 2: Verify install**

```bash
npx vitest --version
```

Expected: prints a version number like `3.x.x`.

---

## Task 2: Create vitest.config.ts

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write the config**

Create `vitest.config.ts` at the project root:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

---

## Task 3: Create the test setup file

**Files:**
- Create: `src/test/setup.ts`

- [ ] **Step 1: Write the setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

This registers all custom matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) for every test file automatically.

---

## Task 4: Create tsconfig.test.json

**Files:**
- Create: `tsconfig.test.json`

This gives the TypeScript language server (your editor) awareness of Vitest's global APIs (`describe`, `it`, `expect`, `vi`) without adding them to the production tsconfig.

- [ ] **Step 1: Write the file**

Create `tsconfig.test.json` at the project root:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "vitest.config.ts"
  ]
}
```

---

## Task 5: Write and verify the unit test for snapToGrid

**Files:**
- Create: `src/app/knowledge_base/features/diagram/utils/gridSnap.test.ts`

- [ ] **Step 1: Write the failing-first test**

`gridSnap.ts` already exists and exports `snapToGrid(v, size?)` and `GRID_SIZE = 10`. Write the test:

```ts
import { describe, it, expect } from 'vitest'
import { snapToGrid, GRID_SIZE } from './gridSnap'

describe('snapToGrid', () => {
  it('snaps a value to the nearest grid multiple', () => {
    expect(snapToGrid(14)).toBe(10)
    expect(snapToGrid(15)).toBe(20)
    expect(snapToGrid(20)).toBe(20)
  })

  it('uses GRID_SIZE as the default step', () => {
    expect(snapToGrid(3)).toBe(Math.round(3 / GRID_SIZE) * GRID_SIZE)
  })

  it('accepts a custom grid size', () => {
    expect(snapToGrid(7, 5)).toBe(5)
    expect(snapToGrid(8, 5)).toBe(10)
  })

  it('handles negative values', () => {
    expect(snapToGrid(-14)).toBe(-10)
    expect(snapToGrid(-15)).toBe(-20)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/app/knowledge_base/features/diagram/utils/gridSnap.test.ts
```

Expected output:
```
✓ src/app/knowledge_base/features/diagram/utils/gridSnap.test.ts (4)
  ✓ snapToGrid > snaps a value to the nearest grid multiple
  ✓ snapToGrid > uses GRID_SIZE as the default step
  ✓ snapToGrid > accepts a custom grid size
  ✓ snapToGrid > handles negative values

Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts src/test/setup.ts tsconfig.test.json \
  src/app/knowledge_base/features/diagram/utils/gridSnap.test.ts
git commit -m "test: add Vitest + RTL setup with first unit test"
```

---

## Task 6: Add npm scripts to package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the scripts block**

Open `package.json` and replace the `"scripts"` section with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest",
  "test:run": "vitest run",
  "test:ui": "vitest --ui",
  "coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
},
```

- [ ] **Step 2: Verify `npm test` works**

```bash
npm test -- --run
```

Expected: same 4-test pass output as Task 5.

---

## Task 7: Install Playwright and create its config

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (devDependencies — handled by npm install)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
```

- [ ] **Step 2: Install the Chromium browser binary**

```bash
npx playwright install chromium
```

Expected: downloads Chromium to the local playwright cache (~150 MB).

- [ ] **Step 3: Write playwright.config.ts**

Create `playwright.config.ts` at the project root:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

The `webServer` block starts `next dev` automatically before the test run and shuts it down after. On local dev it reuses an already-running server (port 3000) to avoid restart overhead.

---

## Task 8: Write and verify the Playwright smoke test

**Files:**
- Create: `e2e/app.spec.ts`

- [ ] **Step 1: Create the e2e directory and smoke test**

Create `e2e/app.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('app loads without JS errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()

  expect(errors).toHaveLength(0)
})
```

- [ ] **Step 2: Run the E2E test**

```bash
npm run test:e2e
```

Expected:
```
Running 1 test using 1 worker
  ✓  [chromium] › e2e/app.spec.ts:3:5 › app loads without JS errors (Xms)

  1 passed (Xs)
```

If the app shows a Next.js 404 on `/`, update `page.goto('/')` to the actual route — find it by checking `src/app/` for the first `page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts e2e/app.spec.ts package.json
git commit -m "test: add Playwright setup with smoke test"
```

---

## Self-Review

**Spec coverage:**
- [x] Vitest installed and configured — Tasks 1–2
- [x] RTL + jest-dom installed and wired via setup file — Tasks 1, 3
- [x] TypeScript globals typed for editor — Task 4
- [x] Unit test proves Vitest works end-to-end — Task 5
- [x] npm scripts for test, coverage, e2e — Task 6
- [x] Playwright installed with Chromium — Task 7
- [x] E2E smoke test proves Playwright works — Task 8

**Placeholder scan:** None found. All code blocks contain complete, runnable content.

**Type consistency:** `snapToGrid` and `GRID_SIZE` match the exact exports in `gridSnap.ts:1-5`.
