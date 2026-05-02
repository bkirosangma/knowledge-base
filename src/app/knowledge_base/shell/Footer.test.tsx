import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useEffect } from 'react'
import Footer from './Footer'
import { FooterProvider, useFooterContext, type DiagramFooterBridge } from './FooterContext'
import { ToolbarProvider, useToolbarContext, type PaneType, type FocusedPane } from './ToolbarContext'
import type { PaneEntry } from './PaneManager'
import { FileWatcherProvider } from '../shared/context/FileWatcherContext'

// Covers SHELL-1.3-01 through 1.3-08. 1.3-05/06 (live updates) are integration-level
// and covered by Canvas/useZoom tests in later buckets.

/** Test harness that drives both contexts into a specified state, then renders Footer. */
function FooterHarness({
  focusedEntry,
  isSplit,
  leftInfo = null,
  rightInfo = null,
  leftPaneType = null,
  rightPaneType = null,
  focused = 'single',
}: {
  focusedEntry: PaneEntry | null
  isSplit: boolean
  leftInfo?: DiagramFooterBridge | null
  rightInfo?: DiagramFooterBridge | null
  leftPaneType?: PaneType | null
  rightPaneType?: PaneType | null
  focused?: FocusedPane
}) {
  function Setup() {
    const toolbar = useToolbarContext()
    const footer = useFooterContext()
    useEffect(() => {
      toolbar.setLeftPaneType(leftPaneType)
      toolbar.setRightPaneType(rightPaneType)
      toolbar.setFocusedPane(focused)
      footer.setLeftInfo(leftInfo)
      footer.setRightInfo(rightInfo)
    })
    return null
  }
  return (
    <ToolbarProvider>
      <FooterProvider>
        <FileWatcherProvider>
          <Setup />
          <Footer focusedEntry={focusedEntry} isSplit={isSplit} />
        </FileWatcherProvider>
      </FooterProvider>
    </ToolbarProvider>
  )
}

const docEntry: PaneEntry = { filePath: 'notes/a.md', fileType: 'document' }
const diagEntry: PaneEntry = { filePath: 'diagrams/x.json', fileType: 'diagram' }

describe('Footer — filename display', () => {
  it('SHELL-1.3-01: single view shows the filename without a side label', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.queryByText(/\[Left\]|\[Right\]/)).toBeNull()
  })

  it('SHELL-1.3-02: split view prepends [Left] or [Right] before the filename', () => {
    render(
      <FooterHarness
        focusedEntry={docEntry} isSplit
        leftPaneType="document" rightPaneType="document" focused="left"
      />,
    )
    expect(screen.getByText('[Left]')).toBeTruthy()

    render(
      <FooterHarness
        focusedEntry={docEntry} isSplit
        leftPaneType="document" rightPaneType="document" focused="right"
      />,
    )
    expect(screen.getAllByText('[Right]').length).toBeGreaterThan(0)
  })

  it('renders no filename block when focusedEntry is null', () => {
    const { container } = render(
      <FooterHarness focusedEntry={null} isSplit={false} />,
    )
    // No filename span rendered; the left side of the bar is empty.
    expect(container.querySelector('span.truncate')).toBeNull()
  })
})

describe('Footer — diagram stats', () => {
  const info: DiagramFooterBridge = {
    kind: 'diagram',
    world: { w: 1234, h: 567 },
    patches: 5,
    zoom: 1.5,
  }

  it('SHELL-1.3-03: shows world dimensions, patch count, and zoom% for the focused diagram pane', () => {
    render(<FooterHarness focusedEntry={diagEntry} isSplit={false} leftInfo={info} />)
    expect(screen.getByText(/1234\s*×\s*567/)).toBeTruthy()
    expect(screen.getByText('5 patches')).toBeTruthy()
    expect(screen.getByText('150%')).toBeTruthy()
  })

  it('singularises "1 patch" when patches === 1', () => {
    const solo = { ...info, patches: 1 }
    render(<FooterHarness focusedEntry={diagEntry} isSplit={false} leftInfo={solo} />)
    expect(screen.getByText('1 patch')).toBeTruthy()
  })

  it('SHELL-1.3-04: document pane omits diagram stats (no info in context)', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} leftInfo={null} />)
    expect(screen.queryByText(/patch/)).toBeNull()
    expect(screen.queryByText(/%$/)).toBeNull()
  })

  it('split view reads info for the FOCUSED pane', () => {
    const leftInfo: DiagramFooterBridge = {
      kind: 'diagram', world: { w: 100, h: 100 }, patches: 1, zoom: 1,
    }
    const rightInfo: DiagramFooterBridge = {
      kind: 'diagram', world: { w: 999, h: 999 }, patches: 9, zoom: 2,
    }
    render(
      <FooterHarness
        focusedEntry={diagEntry} isSplit
        leftPaneType="diagram" rightPaneType="diagram" focused="right"
        leftInfo={leftInfo} rightInfo={rightInfo}
      />,
    )
    // Right pane is focused → show 999×999 / 9 patches / 200%.
    expect(screen.getByText(/999\s*×\s*999/)).toBeTruthy()
    expect(screen.getByText('9 patches')).toBeTruthy()
    expect(screen.getByText('200%')).toBeTruthy()
  })
})

describe('Footer — Reset App button (SHELL-1.3-07, SHELL-1.3-08)', () => {
  // The real implementation calls window.location.reload(). jsdom's
  // reload is non-configurable on the prototype, so we swap out
  // window.location wholesale with a minimal stub for the duration of the test.
  const originalLocation = window.location
  let reloadMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.setItem('dummy-key', 'value')
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: reloadMock },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
  })

  it('SHELL-1.3-07: first click shows confirm popover without resetting', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    fireEvent.click(screen.getByText('Reset App'))
    expect(screen.getByText(/Clear all local state/)).toBeTruthy()
    expect(localStorage.getItem('dummy-key')).toBe('value')
    expect(reloadMock).not.toHaveBeenCalled()
  })

  it('SHELL-1.3-07: confirming clears localStorage and reloads', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    fireEvent.click(screen.getByText('Reset App'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(localStorage.getItem('dummy-key')).toBeNull()
    expect(reloadMock).toHaveBeenCalledTimes(1)
  })

  it('SHELL-1.3-08: Escape dismisses the confirm popover without resetting', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    fireEvent.click(screen.getByText('Reset App'))
    expect(screen.getByText(/Clear all local state/)).toBeTruthy()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByText(/Clear all local state/)).toBeNull()
    expect(localStorage.getItem('dummy-key')).toBe('value')
    expect(reloadMock).not.toHaveBeenCalled()
  })
})

describe('Footer — Last synced chip (SHELL-1.3-09, SHELL-1.3-10)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('SHELL-1.3-09: renders "Last synced 0s ago" immediately on mount', () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    const chip = screen.getByTestId('last-synced-chip')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toBe('Last synced 0s ago')
  })

  it('SHELL-1.3-10: chip ticks up once per second of wall time', async () => {
    render(<FooterHarness focusedEntry={docEntry} isSplit={false} />)
    expect(screen.getByTestId('last-synced-chip').textContent).toBe('Last synced 0s ago')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('last-synced-chip').textContent).toBe('Last synced 1s ago')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('last-synced-chip').textContent).toBe('Last synced 2s ago')
  })
})
