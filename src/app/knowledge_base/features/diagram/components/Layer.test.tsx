import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Layer from './Layer'

// Covers DIAG-3.7-02/03/04 (layer rendering + drag + resize entry points)
// and DIAG-3.7-07 (drag start). Full drag-and-drop motion lives in useLayerDrag.

const baseProps = {
  id: 'L1',
  title: 'Presentation',
  left: 10, width: 400,
  top: 20, height: 200,
  bg: '#eff3f9',
  border: '#d0d5dd',
}

describe('Layer — title + positioning', () => {
  it('renders the title text', () => {
    render(<Layer {...baseProps} />)
    expect(screen.getByText('Presentation')).toBeTruthy()
  })

  it('applies left/width/top/height as inline styles on the body', () => {
    const { container } = render(<Layer {...baseProps} />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    expect(body.style.left).toBe('10px')
    expect(body.style.width).toBe('400px')
    expect(body.style.top).toBe('20px')
    expect(body.style.height).toBe('200px')
  })

  it('applies custom textColor to the title', () => {
    render(<Layer {...baseProps} textColor="#1e40af" />)
    const title = screen.getByText('Presentation') as HTMLSpanElement
    expect(title.style.color).toMatch(/rgb\(30,\s*64,\s*175\)|#1e40af/)
  })

  it('defaults textColor to #334155 when not provided', () => {
    render(<Layer {...baseProps} />)
    const title = screen.getByText('Presentation') as HTMLSpanElement
    expect(title.style.color).toMatch(/rgb\(51,\s*65,\s*85\)|#334155/)
  })
})

describe('Layer — selected state', () => {
  it('isSelected applies solid 2-px blue border class', () => {
    const { container } = render(<Layer {...baseProps} isSelected />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    expect(body.className).toContain('border-blue-400')
    expect(body.className).toContain('border-solid')
    expect(body.className).toContain('border-2')
  })

  it('unselected uses dashed border', () => {
    const { container } = render(<Layer {...baseProps} />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    expect(body.className).toContain('border-dashed')
  })

  it('unselected layer inherits border color from prop', () => {
    const { container } = render(<Layer {...baseProps} border="#ff00ff" />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    expect(body.style.borderColor).toMatch(/rgb\(255,\s*0,\s*255\)|#ff00ff/)
  })
})

describe('Layer — dimmed state', () => {
  it('dimmed applies 0.55 opacity to body and title', () => {
    const { container } = render(<Layer {...baseProps} dimmed />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    const title = screen.getByText('Presentation') as HTMLSpanElement
    expect(body.style.opacity).toBe('0.55')
    expect(title.style.opacity).toBe('0.55')
  })

  it('dimmed hides the resize handles (never rendered)', () => {
    const onResizeStart = vi.fn()
    const { container } = render(
      <Layer {...baseProps} dimmed onResizeStart={onResizeStart} />,
    )
    // Resize handles live on .cursor-ew-resize / .cursor-ns-resize wrappers.
    expect(container.querySelector('.cursor-ew-resize')).toBeNull()
    expect(container.querySelector('.cursor-ns-resize')).toBeNull()
  })
})

describe('Layer — drag & resize callbacks', () => {
  it('mousedown on the body (direct target) fires onDragStart', () => {
    const onDragStart = vi.fn()
    const { container } = render(<Layer {...baseProps} onDragStart={onDragStart} />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    fireEvent.mouseDown(body)
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragStart.mock.calls[0][0]).toBe('L1')
  })

  it('mousedown on the title fires onDragStart', () => {
    const onDragStart = vi.fn()
    render(<Layer {...baseProps} onDragStart={onDragStart} />)
    fireEvent.mouseDown(screen.getByText('Presentation'))
    expect(onDragStart).toHaveBeenCalledWith('L1', expect.anything())
  })

  it('isDragging flips the cursor class to grabbing', () => {
    const { container } = render(<Layer {...baseProps} isDragging />)
    const body = container.querySelector('.rounded-xl') as HTMLDivElement
    expect(body.className).toContain('cursor-grabbing')
  })

  it('renders 4 resize handle regions when onResizeStart is provided', () => {
    const { container } = render(
      <Layer {...baseProps} onResizeStart={() => {}} />,
    )
    expect(container.querySelectorAll('.cursor-ew-resize').length).toBe(2) // left + right
    expect(container.querySelectorAll('.cursor-ns-resize').length).toBe(2) // top + bottom
  })

  it('no handles when onResizeStart is omitted', () => {
    const { container } = render(<Layer {...baseProps} />)
    expect(container.querySelector('.cursor-ew-resize')).toBeNull()
    expect(container.querySelector('.cursor-ns-resize')).toBeNull()
  })

  it('mousedown on a resize edge fires onResizeStart with the correct edge', () => {
    const onResizeStart = vi.fn()
    const { container } = render(
      <Layer {...baseProps} onResizeStart={onResizeStart} />,
    )
    const handles = container.querySelectorAll('.cursor-ew-resize, .cursor-ns-resize')
    // Mousedown each in DOM order: left, right, top, bottom.
    handles.forEach((h) => fireEvent.mouseDown(h))
    expect(onResizeStart).toHaveBeenCalledTimes(4)
    expect(onResizeStart.mock.calls.map((c) => c[1])).toEqual([
      'left', 'right', 'top', 'bottom',
    ])
  })

  it('double-click on title fires onDoubleClick(id)', () => {
    const onDoubleClick = vi.fn()
    render(<Layer {...baseProps} onDoubleClick={onDoubleClick} />)
    fireEvent.doubleClick(screen.getByText('Presentation'))
    expect(onDoubleClick).toHaveBeenCalledWith('L1')
  })
})
