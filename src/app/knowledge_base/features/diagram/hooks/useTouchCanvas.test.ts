import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useTouchCanvas, findNodeIdFromTarget } from './useTouchCanvas'

// Covers DIAG-3.24-03..09 (touch hook unit tests). See test-cases/03-diagram.md §3.24.
//
// These complement the (intentionally narrow) Playwright touch coverage —
// dispatching synthetic touch events through Playwright is flaky, so we
// pin the hook contract here and let e2e cover only the read-only mount.

interface TouchInit {
  identifier?: number
  clientX: number
  clientY: number
  target?: EventTarget
}

function makeTouch(t: TouchInit): Touch {
  return {
    identifier: t.identifier ?? 0,
    clientX: t.clientX,
    clientY: t.clientY,
    target: t.target ?? document.body,
    pageX: t.clientX,
    pageY: t.clientY,
    screenX: t.clientX,
    screenY: t.clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 0,
  } as unknown as Touch
}

function fireTouch(
  el: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Touch[],
  changedTouches: Touch[] = touches,
) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  // Patch in TouchList-like fields so the hook reads them.
  Object.defineProperty(ev, 'touches', { value: touches })
  Object.defineProperty(ev, 'changedTouches', { value: changedTouches })
  el.dispatchEvent(ev)
  return ev
}

/**
 * Fire a touch event on a descendant so it bubbles to the listener on
 * `canvas`. The hook reads `e.target` to find the touched node — when
 * we dispatch directly on the canvas the target is the canvas itself,
 * so node-aware tests must dispatch on the inner node and let bubble
 * carry it up.
 */
function fireTouchOn(
  bubbleSource: HTMLElement,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: Touch[],
  changedTouches: Touch[] = touches,
) {
  return fireTouch(bubbleSource, type, touches, changedTouches)
}

describe('findNodeIdFromTarget', () => {
  it('walks ancestors to find a node-* testid', () => {
    const root = document.createElement('div')
    root.setAttribute('data-testid', 'node-abc123')
    const child = document.createElement('span')
    root.appendChild(child)
    expect(findNodeIdFromTarget(child)).toBe('abc123')
  })

  it('returns null when no node ancestor exists', () => {
    const lone = document.createElement('div')
    expect(findNodeIdFromTarget(lone)).toBeNull()
  })
})

describe('useTouchCanvas', () => {
  let canvas: HTMLDivElement

  beforeEach(() => {
    canvas = document.createElement('div')
    document.body.appendChild(canvas)
    // Make scrollTop / scrollLeft mutable for the pan assertions.
    Object.defineProperty(canvas, 'scrollLeft', { value: 0, writable: true, configurable: true })
    Object.defineProperty(canvas, 'scrollTop',  { value: 0, writable: true, configurable: true })
  })

  afterEach(() => {
    canvas.remove()
    vi.useRealTimers()
  })

  function harness({ enabled = true }: { enabled?: boolean } = {}) {
    const setZoomTo = vi.fn<(z: number) => void>()
    const onLongPress = vi.fn<(id: string) => void>()

    const { result, unmount, rerender } = renderHook(
      (props: { enabled: boolean }) => {
        const ref = useRef<HTMLDivElement>(canvas)
        const zoomRef = useRef(1)
        useTouchCanvas({
          canvasRef: ref,
          zoomRef,
          setZoomTo,
          enabled: props.enabled,
          onLongPress,
        })
        return { ref, zoomRef }
      },
      { initialProps: { enabled } },
    )

    return { result, unmount, rerender, setZoomTo, onLongPress }
  }

  it('DIAG-3.24-03: enabled=false → no-op (single tap does not fire click)', () => {
    harness({ enabled: false })
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-x')
    canvas.appendChild(node)
    const onClick = vi.fn()
    node.addEventListener('click', onClick)

    fireTouch(canvas, 'touchstart', [makeTouch({ clientX: 50, clientY: 50, target: node })])
    fireTouch(canvas, 'touchend',   [], [makeTouch({ clientX: 50, clientY: 50, target: node })])
    expect(onClick).not.toHaveBeenCalled()
  })

  it('DIAG-3.24-04: single tap dispatches synthetic click on the touched element', () => {
    harness()
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-x')
    canvas.appendChild(node)
    const onClick = vi.fn()
    node.addEventListener('click', onClick)

    // Dispatch on the node — the hook listens on canvas; the touch
    // bubbles up so `e.target` is the node, matching real touch behaviour.
    fireTouchOn(node, 'touchstart', [makeTouch({ clientX: 50, clientY: 50, target: node })])
    fireTouchOn(node, 'touchend',   [], [makeTouch({ clientX: 50, clientY: 50, target: node })])

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('DIAG-3.24-05: tap with movement >8 px does NOT synthesise a click', () => {
    harness()
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-x')
    canvas.appendChild(node)
    const onClick = vi.fn()
    node.addEventListener('click', onClick)

    fireTouch(canvas, 'touchstart', [makeTouch({ clientX: 50, clientY: 50, target: node })])
    fireTouch(canvas, 'touchmove',  [makeTouch({ clientX: 80, clientY: 50, target: node })])
    fireTouch(canvas, 'touchend',   [], [makeTouch({ clientX: 80, clientY: 50, target: node })])

    expect(onClick).not.toHaveBeenCalled()
  })

  it('DIAG-3.24-06: long-press on a node fires onLongPress(id) after 500 ms', () => {
    vi.useFakeTimers()
    const { onLongPress } = harness()
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-target-123')
    canvas.appendChild(node)

    fireTouchOn(node, 'touchstart', [makeTouch({ clientX: 50, clientY: 50, target: node })])
    act(() => { vi.advanceTimersByTime(500) })

    expect(onLongPress).toHaveBeenCalledWith('target-123')
  })

  it('DIAG-3.24-07: movement before 500 ms cancels long-press', () => {
    vi.useFakeTimers()
    const { onLongPress } = harness()
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-target')
    canvas.appendChild(node)

    fireTouch(canvas, 'touchstart', [makeTouch({ clientX: 50, clientY: 50, target: node })])
    fireTouch(canvas, 'touchmove',  [makeTouch({ clientX: 80, clientY: 50, target: node })])
    act(() => { vi.advanceTimersByTime(600) })

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('DIAG-3.24-08: two-finger pinch calls setZoomTo with scaled value', () => {
    const { setZoomTo } = harness()

    fireTouch(canvas, 'touchstart', [
      makeTouch({ identifier: 0, clientX: 100, clientY: 100 }),
      makeTouch({ identifier: 1, clientX: 200, clientY: 100 }),
    ])
    // Pinch out — distance doubles, expect setZoomTo to be called with 2.
    fireTouch(canvas, 'touchmove', [
      makeTouch({ identifier: 0, clientX: 50,  clientY: 100 }),
      makeTouch({ identifier: 1, clientX: 250, clientY: 100 }),
    ])

    expect(setZoomTo).toHaveBeenCalled()
    const lastArg = setZoomTo.mock.calls[setZoomTo.mock.calls.length - 1][0]
    // Initial zoom 1 × (200 / 100) = 2.
    expect(lastArg).toBeCloseTo(2, 1)
  })

  it('DIAG-3.24-09: two-finger pan adjusts canvas scroll by midpoint delta', () => {
    harness()

    fireTouch(canvas, 'touchstart', [
      makeTouch({ identifier: 0, clientX: 100, clientY: 100 }),
      makeTouch({ identifier: 1, clientX: 200, clientY: 200 }),
    ])
    // Move both fingers right 50 + down 30 — midpoint shifts by the same.
    // Pan inverts: scrollLeft DECREASES when fingers move right.
    fireTouch(canvas, 'touchmove', [
      makeTouch({ identifier: 0, clientX: 150, clientY: 130 }),
      makeTouch({ identifier: 1, clientX: 250, clientY: 230 }),
    ])

    expect(canvas.scrollLeft).toBe(-50)
    expect(canvas.scrollTop).toBe(-30)
  })

  it('cleanup removes listeners on unmount', () => {
    const { unmount } = harness()
    const node = document.createElement('div')
    node.setAttribute('data-testid', 'node-x')
    canvas.appendChild(node)
    const onClick = vi.fn()
    node.addEventListener('click', onClick)

    unmount()
    fireTouch(canvas, 'touchstart', [makeTouch({ clientX: 0, clientY: 0, target: node })])
    fireTouch(canvas, 'touchend',   [], [makeTouch({ clientX: 0, clientY: 0, target: node })])
    expect(onClick).not.toHaveBeenCalled()
  })
})
