import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import SplitPane from './SplitPane'

// Covers SHELL-1.4-10..13 (divider drag, clamp, persistence).
// SHELL-1.4-12 (divider hover highlight) is verified via CSS class presence
// rather than real hover rendering — JSDOM doesn't compute :hover styles.

const STORAGE_KEY = 'test-split-ratio'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})

function renderSplit(defaultRatio = 0.5, storageKey = STORAGE_KEY) {
  return render(
    <SplitPane
      defaultRatio={defaultRatio}
      storageKey={storageKey}
      left={<div data-testid="left">left content</div>}
      right={<div data-testid="right">right content</div>}
    />,
  )
}

/** Mock getBoundingClientRect so ratio math is predictable. */
function mockContainerRect(container: HTMLElement, rect: Partial<DOMRect>) {
  const el = container.firstChild as HTMLElement
  el.getBoundingClientRect = () =>
    ({ top: 0, bottom: 100, left: 0, right: 1000, width: 1000, height: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  Object.assign(el.getBoundingClientRect(), rect)
}

describe('SplitPane — initial render', () => {
  it('renders both panes with the default ratio when no stored value', () => {
    const { getByTestId } = renderSplit(0.5)
    expect(getByTestId('left').textContent).toBe('left content')
    expect(getByTestId('right').textContent).toBe('right content')
  })

  it('honours defaultRatio on first render (50/50 → each half width)', () => {
    const { container } = renderSplit(0.5)
    const children = container.firstChild?.childNodes
    const leftPane = children?.[0] as HTMLElement
    const rightPane = children?.[2] as HTMLElement
    expect(leftPane.style.width).toBe('50%')
    expect(rightPane.style.width).toBe('50%')
  })

  it('reads persisted ratio from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, '0.3')
    const { container } = renderSplit(0.5)
    const leftPane = container.firstChild?.firstChild as HTMLElement
    // 0.3 * 100 = 30%
    expect(leftPane.style.width).toBe('30%')
  })
})

describe('SplitPane — divider drag (SHELL-1.4-10)', () => {
  it('SHELL-1.4-10: drag divider changes ratio (mouseDown → mouseMove)', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    const divider = container.firstChild?.childNodes[1] as HTMLElement
    fireEvent.mouseDown(divider)

    // Drag to clientX=700 → ratio = 700/1000 = 0.7 (within clamp).
    act(() => {
      fireEvent.mouseMove(window, { clientX: 700 })
    })

    const leftPane = container.firstChild?.firstChild as HTMLElement
    expect(leftPane.style.width).toBe('70%')
  })

  it('mouse move without mouseDown is a no-op', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    act(() => {
      fireEvent.mouseMove(window, { clientX: 900 })
    })
    const leftPane = container.firstChild?.firstChild as HTMLElement
    // No drag active → ratio unchanged.
    expect(leftPane.style.width).toBe('50%')
  })
})

describe('SplitPane — clamp (SHELL-1.4-11)', () => {
  it('SHELL-1.4-11: drag below 20% clamps to 20%', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    const divider = container.firstChild?.childNodes[1] as HTMLElement
    fireEvent.mouseDown(divider)
    // clientX=50 → 50/1000 = 0.05 → clamped to 0.2
    act(() => {
      fireEvent.mouseMove(window, { clientX: 50 })
    })

    const leftPane = container.firstChild?.firstChild as HTMLElement
    expect(leftPane.style.width).toBe('20%')
  })

  it('SHELL-1.4-11: drag beyond 80% clamps to 80%', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    const divider = container.firstChild?.childNodes[1] as HTMLElement
    fireEvent.mouseDown(divider)
    // clientX=950 → 0.95 → clamped to 0.8
    act(() => {
      fireEvent.mouseMove(window, { clientX: 950 })
    })

    const leftPane = container.firstChild?.firstChild as HTMLElement
    expect(leftPane.style.width).toBe('80%')
  })
})

describe('SplitPane — divider hover highlight (SHELL-1.4-12)', () => {
  it('SHELL-1.4-12: divider has hover:bg-blue-400 class for highlight', () => {
    const { container } = renderSplit(0.5)
    const divider = container.firstChild?.childNodes[1] as HTMLElement
    expect(divider.className).toMatch(/hover:bg-blue-400/)
    expect(divider.className).toMatch(/cursor-col-resize/)
  })
})

describe('SplitPane — persistence on mouse-up (SHELL-1.4-13)', () => {
  it('SHELL-1.4-13: mouseUp writes the current ratio to localStorage', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    const divider = container.firstChild?.childNodes[1] as HTMLElement
    fireEvent.mouseDown(divider)
    act(() => {
      fireEvent.mouseMove(window, { clientX: 600 })
    })
    act(() => {
      fireEvent.mouseUp(window)
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('0.6')
  })

  it('no drag → mouseUp does not touch localStorage', () => {
    renderSplit(0.5)
    act(() => {
      fireEvent.mouseUp(window)
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('mouseUp clears the body cursor and userSelect overrides', () => {
    const { container } = renderSplit(0.5)
    mockContainerRect(container, {})

    const divider = container.firstChild?.childNodes[1] as HTMLElement
    fireEvent.mouseDown(divider)
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    act(() => {
      fireEvent.mouseUp(window)
    })
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })
})
