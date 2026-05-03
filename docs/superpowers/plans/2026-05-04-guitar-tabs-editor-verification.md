# TAB-008 Verification Findings (T0)

Generated: 2026-05-04. Branch: `plan/guitar-tabs-editor`.  
Delete this file when TAB-008 ships (reviewers only need it during the
implementation window).

---

## Score mutation

- **In-place mutation: safe**  
  `AlphaTexImporter.initFromString` parses alphaTex into a `Score`.
  Mutating `note.fret` directly on the resulting object is picked up
  verbatim by `AlphaTexExporter.exportToString` — no clone required
  for the data-model round-trip.  
  Confirmed by scratch test: parse `"5.1"` → mutate `note.fret = 7` →
  export contains `"7.1"` and does not contain `"5.1"`. ✅

- **renderScore re-render: fires scoreLoaded per d.ts docs**  
  The alphaTab.d.ts (line 2257) states: *"This event is fired whenever
  a new song is loaded or changing due to `renderScore` or
  `renderTracks` calls."* Cannot be verified in jsdom (no canvas /
  workers). Deferred to T2 manual browser check during implementation.

- **Visual repaint: deferred**  
  No canvas paint in jsdom. Confirm visually during T2 when the edit
  flow is wired up in the browser.

---

## Hit-test API

- **Event name: `beatMouseDown`** (primary) and `noteMouseDown` (secondary)
- **Payload type:**
  - `beatMouseDown: IEventEmitterOfT<Beat>` — fires with the `Beat`
    object under the cursor. Payload fields relevant to TAB-014:
    - `beat.index` — zero-based index within the voice
    - `beat.voice` → `Voice`
    - `beat.voice.index` — voice index within the bar
    - `beat.voice.bar` → `Bar`
    - `beat.voice.bar.index` — bar index within the staff
    - `beat.voice.bar.staff` → `Staff`
    - `beat.voice.bar.staff.index` — staff index within the track
    - `beat.voice.bar.staff.track` → `Track`
    - `beat.voice.bar.staff.track.index` — track index within the score
    - `beat.notes[n].string` — 1-based string number for the hit note
  - `noteMouseDown: IEventEmitterOfT<Note>` — fires with the specific
    `Note` under the cursor (more precise; includes `.string` and
    `.fret` directly).
  - Also: `beatMouseUp: IEventEmitterOfT<Beat | null>`
- **Fallback: none needed** — native API available.  
  T14 (`TabEditorCanvasOverlay`) should subscribe to `noteMouseDown`
  for string-level precision; fall back to `beatMouseDown` if the user
  clicks a beat area with no note.

---

## Keydown overlay

- **Focus path: works** — a `tabIndex={-1}` `div` with
  `position: absolute` over the canvas can be focused
  programmatically (`.focus()`) and receives `keydown` events for bare
  letter keys.
- **preventDefault() honoured** — `event.preventDefault()` in the
  handler is reflected as `event.defaultPrevented === true`;
  `fireEvent.keyDown` returns `false` (RTL convention for prevented
  default). ✅
- **jsdom caveat:** jsdom has no real browser defaults for letter keys,
  so suppression of default browser actions (e.g. scroll, browser
  shortcuts) cannot be verified in unit tests. Assume equivalent in
  production browser — confirm during T15 manual check.

---

## Decisions unlocked by T0

| Implementation task | Decision |
|---|---|
| T2 `applyEdit` set-fret | Mutate `note.fret` in-place; no clone required for data model; call `api.renderScore(score)` to repaint |
| T14 `TabEditorCanvasOverlay` | Subscribe to `api.noteMouseDown` (primary) + `api.beatMouseDown` (fallback); navigate up via `beat.voice.bar.staff.track.index` chain for cursor coords |
| T15 `useTabKeyboard` | Mount a transparent `tabIndex={-1}` div over the canvas; focus on editor-mode activation; attach `onKeyDown` with `preventDefault()` for all handled keys |
