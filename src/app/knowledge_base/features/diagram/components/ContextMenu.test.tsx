import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContextMenu from './ContextMenu'

// Covers DIAG-3.12-01..06 area (diagram context-menu actions and dismissal).

describe('ContextMenu — element target', () => {
  it('renders a single "Delete Element" button', () => {
    render(
      <ContextMenu
        x={100} y={200}
        target={{ type: 'element', id: 'n1' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Delete Element/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add Element/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add Layer/ })).toBeNull()
  })

  it('Delete Element fires onDeleteElement(id) then onClose', () => {
    const onDeleteElement = vi.fn()
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'element', id: 'my-node' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={onDeleteElement}
        onDeleteLayer={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete Element/ }))
    expect(onDeleteElement).toHaveBeenCalledWith('my-node')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ContextMenu — layer target', () => {
  it('renders "Add Element" and "Delete Layer" (no "Add Layer")', () => {
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'layer', id: 'L1' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Add Element/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Delete Layer/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add Layer/ })).toBeNull()
  })

  it('Delete Layer fires onDeleteLayer(id) then onClose', () => {
    const onDeleteLayer = vi.fn()
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'layer', id: 'my-layer' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={onDeleteLayer}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Delete Layer/ }))
    expect(onDeleteLayer).toHaveBeenCalledWith('my-layer')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ContextMenu — canvas target', () => {
  it('renders "Add Element" and "Add Layer"', () => {
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Add Element/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add Layer/ })).toBeTruthy()
  })

  it('Add Layer fires onAddLayer then onClose', () => {
    const onAddLayer = vi.fn()
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={onAddLayer}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Add Layer/ }))
    expect(onAddLayer).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ContextMenu — position & dismissal', () => {
  it('uses x/y props as left/top inline styles', () => {
    const { container } = render(
      <ContextMenu
        x={150} y={300}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={() => {}}
      />,
    )
    const root = container.firstChild as HTMLDivElement
    expect(root.style.left).toBe('150px')
    expect(root.style.top).toBe('300px')
  })

  it('Escape key dismisses via onClose', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('outside mousedown fires onClose', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mousedown inside the menu does NOT fire onClose', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        target={{ type: 'canvas' }}
        onAddElement={() => {}}
        onAddLayer={() => {}}
        onDeleteElement={() => {}}
        onDeleteLayer={() => {}}
        onClose={onClose}
      />,
    )
    // Clicking the "Add Element" button triggers onMouseDown with stopPropagation.
    fireEvent.mouseDown(screen.getByRole('button', { name: /Add Element/ }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
