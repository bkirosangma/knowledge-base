import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import Element from './Element'
import ConditionElement from './ConditionElement'

// KB-021 regression: custom React.memo equality should ignore handler
// identity changes and `documentPaths` array-identity churn while still
// re-rendering on data / visual-state prop changes. The render-count
// proxy is a `vi.fn()` icon — Element invokes it once per render.

function makeIconSpy() {
  return vi.fn().mockReturnValue(null) as unknown as React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
}

describe('Element — KB-021 memo equality', () => {
  it('does NOT re-render when nothing in the equality set changes (stable handler identity)', () => {
    const icon = makeIconSpy()
    const stableHandler = () => {}
    const { rerender } = render(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} onDragStart={stableHandler} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    // Re-render with the same handler reference — useCallback contract.
    rerender(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} onDragStart={stableHandler} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)
  })

  it('DOES re-render when a handler identity changes (new closure must bind)', () => {
    // Handlers ARE part of the equality set (not in the spec's literal
    // field list, but required for correctness — closures over isBlocked
    // / readOnly etc. need to reach the rendered DOM listener).
    const icon = makeIconSpy()
    const { rerender } = render(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} onDragStart={() => {}} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} onDragStart={() => {}} />,
    )
    expect(icon).toHaveBeenCalledTimes(2)
  })

  it('does NOT re-render when documentPaths is a new array with same content', () => {
    const icon = makeIconSpy()
    const { rerender } = render(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} hasDocuments documentPaths={['/a.md']} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} hasDocuments documentPaths={['/a.md']} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)
  })

  it('does re-render when x changes', () => {
    const icon = makeIconSpy()
    const { rerender } = render(<Element id="n1" label="A" x={0} y={0} showLabels icon={icon} />)
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(<Element id="n1" label="A" x={50} y={0} showLabels icon={icon} />)
    expect(icon).toHaveBeenCalledTimes(2)
  })

  it('does re-render when isSelected flips', () => {
    const icon = makeIconSpy()
    const { rerender } = render(<Element id="n1" label="A" x={0} y={0} showLabels icon={icon} />)
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(<Element id="n1" label="A" x={0} y={0} showLabels icon={icon} isSelected />)
    expect(icon).toHaveBeenCalledTimes(2)
  })

  it('does re-render when documentPaths content changes', () => {
    const icon = makeIconSpy()
    const { rerender } = render(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} hasDocuments documentPaths={['/a.md']} />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <Element id="n1" label="A" x={0} y={0} showLabels icon={icon} hasDocuments documentPaths={['/a.md', '/b.md']} />,
    )
    expect(icon).toHaveBeenCalledTimes(2)
  })

  it('drag perf proxy: re-rendering 50 Elements with only one position changed re-renders only that one', () => {
    // Simulates a per-frame drag re-render on a 50-node diagram.
    // Each Element has its own icon spy. After bumping just node #7's
    // x, only spy #7 should have been called a second time.
    const stableHandler = () => {}
    const icons = Array.from({ length: 50 }, () => makeIconSpy())
    const positions = Array.from({ length: 50 }, (_, i) => i * 10)

    function Board(props: { positions: number[] }) {
      return (
        <>
          {props.positions.map((x, i) => (
            <Element
              key={i}
              id={`n${i}`}
              label={`N${i}`}
              x={x}
              y={0}
              showLabels
              icon={icons[i]}
              onDragStart={stableHandler}
              onMouseEnter={stableHandler}
              onMouseLeave={stableHandler}
              onResize={stableHandler}
            />
          ))}
        </>
      )
    }

    const { rerender } = render(<Board positions={positions} />)
    icons.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))

    // Bump node 7 only.
    const next = positions.slice()
    next[7] = next[7] + 25
    rerender(<Board positions={next} />)

    icons.forEach((spy, i) => {
      expect(spy, `icon[${i}] should have rendered ${i === 7 ? 2 : 1} times`)
        .toHaveBeenCalledTimes(i === 7 ? 2 : 1)
    })
  })
})

describe('ConditionElement — KB-021 memo equality', () => {
  it('does NOT re-render when nothing in the equality set changes', () => {
    const icon = makeIconSpy()
    const stableHandler = () => {}
    const { rerender } = render(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={2} rotation={0}
        showLabels icon={icon} onDragStart={stableHandler}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={2} rotation={0}
        showLabels icon={icon} onDragStart={stableHandler}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(1)
  })

  it('does re-render when outCount changes', () => {
    const icon = makeIconSpy()
    const { rerender } = render(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={2} rotation={0}
        showLabels icon={icon}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={3} rotation={0}
        showLabels icon={icon}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(2)
  })

  it('does re-render when rotation changes', () => {
    const icon = makeIconSpy()
    const { rerender } = render(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={2} rotation={0}
        showLabels icon={icon}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(1)

    rerender(
      <ConditionElement
        id="c1" label="C" x={0} y={0} w={120} h={80} outCount={2} rotation={90}
        showLabels icon={icon}
      />,
    )
    expect(icon).toHaveBeenCalledTimes(2)
  })
})
