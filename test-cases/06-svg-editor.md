# 6. SVG Editor

Test cases for the SVG editor pane (`SVGEditorView`, `SVGCanvas`, `SVGToolbar`, `useSVGPersistence`).

## 6.1 File creation & routing

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.1-01 | Right-click folder → New → SVG → creates `untitled.svg` and opens editor pane | ❌ |
| SVG-6.1-02 | Hover on folder in explorer → New SVG icon button creates `untitled.svg` | ❌ |
| SVG-6.1-03 | Click `.svg` file in explorer → opens SVG editor pane (not document or diagram pane) | ❌ |

## 6.2 Pane chrome

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.2-01 | SVG editor pane shows PaneHeader with filename without `.svg` extension as title | ✅ |
| SVG-6.2-02 | PaneHeader shows Save and Discard buttons when isDirty=true | ❌ |
| SVG-6.2-03 | Reload page → SVG editor pane is restored from saved pane layout | 🚫 (File System Access API) |

## 6.3 Toolbar

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.3-01 | All 6 tool buttons render (Select, Rectangle, Ellipse, Line, Path, Text) | ✅ |
| SVG-6.3-02 | Clicking a tool button highlights it as active | ✅ |
| SVG-6.3-03 | Undo / Redo buttons are present | ✅ |
| SVG-6.3-04 | Zoom In / Zoom Out / Fit buttons are present | ✅ |

## 6.4 Persistence

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.4-01 | Drawing on canvas sets isDirty=true (unit: useSVGPersistence onChanged) | ✅ |
| SVG-6.4-02 | Cmd+S saves SVG to vault file and clears dirty (unit: useSVGPersistence handleSave) | ✅ |
| SVG-6.4-03 | Discard re-reads file from disk and clears dirty (unit: useSVGPersistence handleDiscard) | ✅ |
| SVG-6.4-04 | Auto-save fires after 200 ms of inactivity (unit: useSVGPersistence debounce) | ✅ |
| SVG-6.4-05 | handleSave failure leaves isDirty=true and reports the error via ShellErrorContext (unit) | ✅ |
| SVG-6.4-06 | Debounced autosave failure leaves isDirty=true and reports the error (unit) | ✅ |
| SVG-6.4-07 | Load failure surfaces via ShellErrorContext instead of being silently swallowed (unit) | ✅ |
| SVG-6.4-08 | Discard failure surfaces via ShellErrorContext without resetting isDirty (unit) | ✅ |
| SVG-6.4-09 | Closing the SVG pane within 200 ms of last edit flushes the pending write to disk (unit: unmount) | ✅ |
| SVG-6.4-10 | Switching activeFile flushes pending writes to the previous path before loading the new file (unit) | ✅ |
| SVG-6.4-11 | Window blur flushes pending writes (unit) | ✅ |
| SVG-6.4-12 | flush() on a clean editor is a no-op (unit) | ✅ |
| SVG-6.4-13 | Drawing on the canvas persists to disk through the repo seam (e2e) | ✅ |
| SVG-6.4-14 | pagehide flushes pending edit (tab-close path) (unit) | ✅ |
| SVG-6.4-15 | visibilitychange to hidden flushes pending edit (unit) | ✅ |
| SVG-6.4-16 | visibilitychange to visible does NOT flush (unit) | ✅ |
| SVG-6.4-17 | MutationObserver fallback fires onChanged on shape-attribute mutations — closes the @svgedit/svgcanvas select-mode-translate gap (unit) | ✅ |
| SVG-6.4-18 | MutationObserver is suppressed during programmatic setSvgString load (unit) | ✅ |
| SVG-6.4-19 | MutationObserver re-attaches after setSvgString rebuilds #svgcontent (unit) | ✅ |
