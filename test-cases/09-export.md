# Test Cases — Export (KB-011)

> Mirrors §9 of [Features.md](../Features.md). Covers the three export
> surfaces — diagram → SVG, diagram → PNG, document → printable PDF —
> plus the `ExportMenu` UI in the pane header.
>
> ID scheme matches `test-cases/README.md`:
> `EXPORT-9.<sub>-<nn>` where `<sub>` aligns with Features.md §9
> subsections.

---

## EXPORT-9.1 Diagram → SVG (`exportDiagramSVG.ts`)

Pure `(doc: DiagramData) => string` returning a standalone SVG that
opens in a fresh browser tab and renders without app CSS.

- **EXPORT-9.1-01** ✅ **Returns a single root `<svg>`** — output starts with `<?xml` declaration and a `<svg xmlns>` root.
- **EXPORT-9.1-02** ✅ **Computes a viewBox bounding all geometry** — viewBox covers every node, layer region, and connection point with a fixed margin.
- **EXPORT-9.1-03** ✅ **Renders rectangle nodes as `<rect>` + `<text>`** — node bg/border/text colour inlined as element attributes (no class lookups). Width = `n.w`; height = `getNodeHeight(n.w)`.
- **EXPORT-9.1-04** ✅ **Renders condition nodes as `<path>` + `<text>`** — uses the existing `getConditionPath` to produce the same diamond/arc shape the canvas uses; rotation applied via `transform="rotate(deg cx cy)"`.
- **EXPORT-9.1-05** ✅ **Renders layer regions as a back-layer `<rect>`** — per-layer rect placed under nodes, fill = `layer.bg`, stroke = `layer.border`, derived via `computeRegions`.
- **EXPORT-9.1-06** ✅ **Renders connections as `<path>`** — the path string from `computePath(...)` is dropped straight into the SVG. Connection colour inlined.
- **EXPORT-9.1-07** ✅ **Renders connection labels at midpoint** — label text positioned at `points[Math.floor(points.length/2)]` (mid-sample of the routed path).
- **EXPORT-9.1-08** ✅ **Diagram title + layer titles render** — diagram title at top of viewBox, layer titles in the corner of each region.
- **EXPORT-9.1-09** ✅ **Empty diagram is still well-formed** — a diagram with no nodes returns a minimal SVG (with the diagram title) rather than throwing.
- **EXPORT-9.1-10** ✅ **Snapshot stability** — a fixture diagram produces a byte-identical SVG across runs (deterministic ordering of nodes / connections / layers).
- **EXPORT-9.1-11** 🚫 **Lucide icons inside nodes** — out of scope for v1; nodes show their label text only. The PR description flags this.
- **EXPORT-9.1-12** 🚫 **Tailwind ring / box-shadow effects** — decorative, intentionally not mirrored.

## EXPORT-9.2 Diagram → PNG (`exportDiagramPNG.ts`)

Wraps the SVG export, rasterises via `<canvas>` at ≥2× resolution,
floors the output width to 1500 px.

- **EXPORT-9.2-01** 🧪 **Output is a valid PNG `Blob`** — `image/png` mime; non-zero size; `naturalWidth`/`naturalHeight` parse OK.
- **EXPORT-9.2-02** 🧪 **Output ≥ 1500 px wide** — scale = `max(2, 1500 / svgIntrinsicWidth)`, so even small diagrams meet the floor.
- **EXPORT-9.2-03** 🧪 **Triggers a download with the correct filename** — `<diagramName>.png` via `URL.createObjectURL` + anchor click.

## EXPORT-9.3 Document → printable PDF (`printDocument.ts` + `globals.print.css`)

Toggles a `data-printing` attribute on `<body>`, calls `window.print()`,
and clears the attribute on the `afterprint` event.

- **EXPORT-9.3-01** ✅ **`printDocument` sets `body[data-printing="document"]`, calls `window.print`, clears on `afterprint`** — unit-testable in jsdom.
- **EXPORT-9.3-02** 🧪 **Print stylesheet hides app chrome** — emulating print media, the header, footer, explorer, pane chrome, and toolbars all become `display: none`.
- **EXPORT-9.3-03** 🧪 **The document body remains visible and full-width** — `.markdown-editor .ProseMirror` is laid out for print: full width, readable line-length, no max-height.
- **EXPORT-9.3-04** ✅ **Restores attributes when print dialog closes** — `afterprint` listener fires once and removes `data-printing`.

## EXPORT-9.4 ExportMenu (`ExportMenu.tsx`)

- **EXPORT-9.4-01** 🧪 **Menu surfaces in pane header** — clickable trigger renders inside the `PaneHeader` for diagram, document, and svgEditor panes.
- **EXPORT-9.4-02** ✅ **Item visibility per pane kind** — `getExportItems(paneType)` returns `["svg", "png"]` for diagram, `["print"]` for document, `["svg", "png"]` for svgEditor, `[]` for graph/graphify/search. Pure helper, unit-tested.
- **EXPORT-9.4-03** 🧪 **Menu hidden when there are no items for the pane** — graph / graphify / search panes never render the trigger.
- **EXPORT-9.4-04** 🧪 **Clicking a menu item triggers the right export** — diagram SVG/PNG hits the export functions; document Print fires `printDocument`.

## EXPORT-9.5 Filenames

- **EXPORT-9.5-01** ✅ **Format is `<basename>.<ext>`** — slash-stripped basename of the file path; extension matches the export kind. (Browser handles collision suffixes via its standard `(1)` / `(2)` mechanism — the audit plan's "date suffix on collision" intent.) Unit-tested.
- **EXPORT-9.5-02** ✅ **Untitled diagrams fall back to a sane default** — when the diagram path is missing/blank, falls back to `diagram.<ext>` / `document.<ext>`.
