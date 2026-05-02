import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, act, fireEvent } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import PaneManager, { usePaneManager } from './PaneManager'
import { ToolbarProvider, useToolbarContext } from './ToolbarContext'
import type { PaneEntry } from './PaneManager'

// Covers SHELL-1.4-01..06 (usePaneManager state transitions),
// SHELL-1.4-08..09 (component focus tracking),
// and SHELL-1.5-05..07 (PaneManager → ToolbarContext sync).
// SHELL-1.4-07 (pane type drives Header controls) is verified via ToolbarContext
// updates — the Header is rendered by a parent component, out of scope here.
// SHELL-1.4-14 (layout restored on directory load) is owned by KnowledgeBaseInner
// and depends on File System Access — covered by Playwright (Bucket 20).

// ── usePaneManager hook — SHELL-1.4-01..06 ────────────────────────────────

describe('usePaneManager — default state (SHELL-1.4-01)', () => {
  it('SHELL-1.4-01: starts with no panes, not split, focus=left', () => {
    const { result } = renderHook(() => usePaneManager())
    expect(result.current.leftPane).toBeNull()
    expect(result.current.rightPane).toBeNull()
    expect(result.current.isSplit).toBe(false)
    expect(result.current.focusedSide).toBe('left')
    expect(result.current.focusedPane).toBe('single')
    expect(result.current.activeEntry).toBeNull()
    expect(result.current.lastClosedPane).toBeNull()
  })
})

describe('usePaneManager — openFile', () => {
  it('opens file into left pane when not split', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    expect(result.current.leftPane).toEqual({ filePath: 'notes/a.md', fileType: 'document' })
    expect(result.current.rightPane).toBeNull()
    expect(result.current.isSplit).toBe(false)
  })

  it('SHELL-1.4-06: routes to focused pane in split view', () => {
    const { result } = renderHook(() => usePaneManager())
    // Enter split with a file on the right (focus becomes "right").
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.enterSplit('notes/b.md', 'document') })
    // Focus is now "right"; openFile should route to the right pane.
    act(() => { result.current.openFile('notes/c.md', 'document') })
    expect(result.current.rightPane?.filePath).toBe('notes/c.md')
    expect(result.current.leftPane?.filePath).toBe('notes/a.md')
  })

  it('openFile routes to left pane when split + focus=left', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.enterSplit('notes/b.md', 'document') })
    act(() => { result.current.setFocusedSide('left') })
    act(() => { result.current.openFile('notes/c.md', 'document') })
    expect(result.current.leftPane?.filePath).toBe('notes/c.md')
    expect(result.current.rightPane?.filePath).toBe('notes/b.md')
  })
})

describe('usePaneManager — enterSplit (SHELL-1.4-02)', () => {
  it('SHELL-1.4-02: enterSplit populates right pane and moves focus to right', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.enterSplit('notes/b.md', 'diagram') })

    expect(result.current.isSplit).toBe(true)
    expect(result.current.rightPane).toEqual({ filePath: 'notes/b.md', fileType: 'diagram' })
    expect(result.current.leftPane?.filePath).toBe('notes/a.md')
    expect(result.current.focusedSide).toBe('right')
    expect(result.current.focusedPane).toBe('right')
  })
})

describe('usePaneManager — exitSplit (SHELL-1.4-03, 1.4-04)', () => {
  it('SHELL-1.4-03: exitSplit with focus=left closes right pane, keeps left file', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/left.md', 'document') })
    act(() => { result.current.enterSplit('notes/right.md', 'document') })
    act(() => { result.current.setFocusedSide('left') })
    act(() => { result.current.exitSplit() })

    expect(result.current.leftPane?.filePath).toBe('notes/left.md')
    expect(result.current.rightPane).toBeNull()
    expect(result.current.focusedSide).toBe('left')
  })

  it('SHELL-1.4-04: exitSplit with focus=right promotes right pane to left', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/left.md', 'document') })
    act(() => { result.current.enterSplit('notes/right.md', 'diagram') })
    // focus is already "right" after enterSplit
    act(() => { result.current.exitSplit() })

    expect(result.current.leftPane).toEqual({ filePath: 'notes/right.md', fileType: 'diagram' })
    expect(result.current.rightPane).toBeNull()
    expect(result.current.focusedSide).toBe('left')
  })
})

describe('usePaneManager — lastClosedPane (SHELL-1.4-05)', () => {
  it('SHELL-1.4-05: exitSplit from right focus captures left pane as lastClosedPane', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/left.md', 'document') })
    act(() => { result.current.enterSplit('notes/right.md', 'document') })
    // focus=right → unfocused is left → left becomes lastClosedPane
    act(() => { result.current.exitSplit() })

    expect(result.current.lastClosedPane).toEqual({
      filePath: 'notes/left.md',
      fileType: 'document',
    })
  })

  it('exitSplit from left focus captures right pane as lastClosedPane', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/left.md', 'document') })
    act(() => { result.current.enterSplit('notes/right.md', 'document') })
    act(() => { result.current.setFocusedSide('left') })
    act(() => { result.current.exitSplit() })

    expect(result.current.lastClosedPane).toEqual({
      filePath: 'notes/right.md',
      fileType: 'document',
    })
  })
})

describe('usePaneManager — closeFocusedPane', () => {
  it('clears left pane when not split', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.closeFocusedPane() })
    expect(result.current.leftPane).toBeNull()
  })

  it('closes right pane when split + focus=right', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.enterSplit('notes/b.md', 'document') })
    // focus is "right"
    act(() => { result.current.closeFocusedPane() })
    expect(result.current.rightPane).toBeNull()
    expect(result.current.leftPane?.filePath).toBe('notes/a.md')
    expect(result.current.focusedSide).toBe('left')
  })

  it('promotes right→left when split + focus=left', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/a.md', 'document') })
    act(() => { result.current.enterSplit('notes/b.md', 'document') })
    act(() => { result.current.setFocusedSide('left') })
    act(() => { result.current.closeFocusedPane() })
    expect(result.current.leftPane?.filePath).toBe('notes/b.md')
    expect(result.current.rightPane).toBeNull()
  })
})

describe('usePaneManager — restoreLayout', () => {
  it('sets both panes and focus in one call', () => {
    const { result } = renderHook(() => usePaneManager())
    const left: PaneEntry = { filePath: 'a.md', fileType: 'document' }
    const right: PaneEntry = { filePath: 'b.md', fileType: 'diagram' }
    act(() => { result.current.restoreLayout(left, right, 'right') })
    expect(result.current.leftPane).toEqual(left)
    expect(result.current.rightPane).toEqual(right)
    expect(result.current.focusedSide).toBe('right')
    expect(result.current.isSplit).toBe(true)
  })

  it('restoreLayout with right=null forces focus=left regardless of argument', () => {
    const { result } = renderHook(() => usePaneManager())
    const left: PaneEntry = { filePath: 'a.md', fileType: 'document' }
    act(() => { result.current.restoreLayout(left, null, 'right') })
    expect(result.current.focusedSide).toBe('left')
  })
})

describe('usePaneManager — activeEntry (SHELL-1.5-05 indirect)', () => {
  it('tracks the focused pane in split view', () => {
    const { result } = renderHook(() => usePaneManager())
    act(() => { result.current.openFile('notes/left.md', 'document') })
    act(() => { result.current.enterSplit('notes/right.md', 'diagram') })
    // focus=right → activeEntry points to right
    expect(result.current.activeEntry?.filePath).toBe('notes/right.md')
    act(() => { result.current.setFocusedSide('left') })
    expect(result.current.activeEntry?.filePath).toBe('notes/left.md')
  })
})

// ── PaneManager component — SHELL-1.4-08, 1.4-09 ───────────────────────────

function Wrapper({ children }: { children: ReactNode }) {
  return <ToolbarProvider>{children}</ToolbarProvider>
}

describe('PaneManager — empty state', () => {
  it('renders emptyState when leftPane is null', () => {
    const { getByText } = render(
      <Wrapper>
        <PaneManager
          leftPane={null}
          rightPane={null}
          isSplit={false}
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={() => <div>should not render</div>}
          emptyState={<div>No file open</div>}
        />
      </Wrapper>,
    )
    expect(getByText('No file open')).toBeTruthy()
  })
})

describe('PaneManager — single-pane rendering', () => {
  it('renders just the left pane when not split', () => {
    const { queryByTestId } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={null}
          isSplit={false}
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={(entry, focused, side) => (
            <div data-testid={`pane-${side}`}>{entry.filePath}-{focused ? 'F' : 'U'}</div>
          )}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    expect(queryByTestId('pane-left')?.textContent).toBe('a.md-F')
    expect(queryByTestId('pane-right')).toBeNull()
  })
})

describe('PaneManager — split rendering + focus border (SHELL-1.4-08)', () => {
  it('SHELL-1.4-08: renders focus border on left pane when focusedSide=left', () => {
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={() => <div>pane</div>}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    // The focus border is an absolute div with `border-blue-500`
    const borders = container.querySelectorAll('.border-blue-500')
    expect(borders.length).toBe(1)
  })

  it('SHELL-1.4-15 (KB-032): focus border carries an sr-only "Focused" label for the active side only', () => {
    const { container, rerender } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={() => <div>pane</div>}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    let focusedLabels = container.querySelectorAll('.sr-only')
    expect(Array.from(focusedLabels).filter((el) => el.textContent === 'Focused').length).toBe(1)

    rerender(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="right"
          setFocusedSide={() => {}}
          renderPane={() => <div>pane</div>}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    focusedLabels = container.querySelectorAll('.sr-only')
    expect(Array.from(focusedLabels).filter((el) => el.textContent === 'Focused').length).toBe(1)
  })

  it('focus border moves to right pane when focusedSide=right', () => {
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="right"
          setFocusedSide={() => {}}
          renderPane={(entry, focused, side) => (
            <div data-testid={`pane-${side}`} data-focused={focused ? 'yes' : 'no'}>
              {entry.filePath}
            </div>
          )}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    const leftPane = container.querySelector('[data-testid="pane-left"]')
    const rightPane = container.querySelector('[data-testid="pane-right"]')
    expect(leftPane?.getAttribute('data-focused')).toBe('no')
    expect(rightPane?.getAttribute('data-focused')).toBe('yes')
  })
})

describe('PaneManager — focus tracking (SHELL-1.4-09)', () => {
  it('SHELL-1.4-09: mouseDown on left pane fires setFocusedSide("left")', () => {
    const setFocusedSide = vi.fn()
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="right"
          setFocusedSide={setFocusedSide}
          renderPane={(entry, _focused, side) => (
            <div data-testid={`content-${side}`}>{entry.filePath}</div>
          )}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    const leftContent = container.querySelector('[data-testid="content-left"]')
    fireEvent.mouseDown(leftContent!)
    expect(setFocusedSide).toHaveBeenCalledWith('left')
  })

  it('mouseDown on right pane fires setFocusedSide("right")', () => {
    const setFocusedSide = vi.fn()
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="left"
          setFocusedSide={setFocusedSide}
          renderPane={(entry, _focused, side) => (
            <div data-testid={`content-${side}`}>{entry.filePath}</div>
          )}
          emptyState={<div>empty</div>}
        />
      </Wrapper>,
    )
    const rightContent = container.querySelector('[data-testid="content-right"]')
    fireEvent.mouseDown(rightContent!)
    expect(setFocusedSide).toHaveBeenCalledWith('right')
  })
})

// ── PaneManager → ToolbarContext sync — SHELL-1.5-06, 1.5-07 ───────────────

describe('PaneManager ⇄ ToolbarContext sync', () => {
  function CtxProbe() {
    const ctx = useToolbarContext()
    return (
      <div
        data-testid="probe"
        data-pane-count={ctx.paneCount}
        data-focused={ctx.focusedPane}
        data-active-type={ctx.activePaneType}
      />
    )
  }

  it('SHELL-1.5-06: PaneManager publishes per-side types — left=document, right=diagram → mixed (focused)', () => {
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
          isSplit
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={() => null}
          emptyState={<div>empty</div>}
        />
        <CtxProbe />
      </Wrapper>,
    )
    const probe = container.querySelector('[data-testid="probe"]') as HTMLElement
    expect(probe.getAttribute('data-pane-count')).toBe('2')
    expect(probe.getAttribute('data-focused')).toBe('left')
    // left=document is focused → activePaneType is "document"
    expect(probe.getAttribute('data-active-type')).toBe('document')
  })

  it('SHELL-1.5-07: focused-pane switch updates activePaneType', () => {
    function Host() {
      const [focused, setFocused] = useState<'left' | 'right'>('left')
      return (
        <>
          <PaneManager
            leftPane={{ filePath: 'a.md', fileType: 'document' }}
            rightPane={{ filePath: 'b.md', fileType: 'diagram' }}
            isSplit
            focusedSide={focused}
            setFocusedSide={setFocused}
            renderPane={(entry, _f, side) => (
              <div data-testid={`content-${side}`}>{entry.filePath}</div>
            )}
            emptyState={<div>empty</div>}
          />
          <CtxProbe />
        </>
      )
    }

    const { container } = render(
      <Wrapper>
        <Host />
      </Wrapper>,
    )
    let probe = container.querySelector('[data-testid="probe"]') as HTMLElement
    expect(probe.getAttribute('data-active-type')).toBe('document')

    // Click into right pane → Host's focusedSide flips → PaneManager effect
    // sets ToolbarContext.focusedPane=right → mixed-type derivation picks right.
    fireEvent.mouseDown(container.querySelector('[data-testid="content-right"]')!)
    probe = container.querySelector('[data-testid="probe"]') as HTMLElement
    expect(probe.getAttribute('data-focused')).toBe('right')
    expect(probe.getAttribute('data-active-type')).toBe('diagram')
  })

  it('single-pane mode reports paneCount=1 and focusedPane="single"', () => {
    const { container } = render(
      <Wrapper>
        <PaneManager
          leftPane={{ filePath: 'a.md', fileType: 'document' }}
          rightPane={null}
          isSplit={false}
          focusedSide="left"
          setFocusedSide={() => {}}
          renderPane={() => null}
          emptyState={<div>empty</div>}
        />
        <CtxProbe />
      </Wrapper>,
    )
    const probe = container.querySelector('[data-testid="probe"]') as HTMLElement
    expect(probe.getAttribute('data-pane-count')).toBe('1')
    expect(probe.getAttribute('data-focused')).toBe('single')
    expect(probe.getAttribute('data-active-type')).toBe('document')
  })
})
