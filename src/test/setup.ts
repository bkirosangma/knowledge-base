import '@testing-library/jest-dom'

// JSDOM does not implement ResizeObserver; polyfill it so components that use
// ResizeObserver (e.g. TableFloatingToolbar) do not throw during tests.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ProseMirror calls getClientRects() on DOM Ranges and Elements during
// scrollToSelection / coordsAtPos. JSDOM doesn't implement it; return an
// empty DOMRectList so these calls are silent no-ops instead of exceptions.
const emptyRectList = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList

const emptyRect = (): DOMRect =>
  ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = emptyRectList
}
if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = emptyRectList
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = emptyRect
}
