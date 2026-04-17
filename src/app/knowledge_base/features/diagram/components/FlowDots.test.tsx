import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import FlowDots from './FlowDots'

// Covers DIAG-3.10-11 (flow-dot animation presence) + visibility gating logic.

const lines = [
  { id: 'l1', path: 'M 0 0 L 100 0', color: '#ff0000' },
  { id: 'l2', path: 'M 0 10 L 100 10', color: '#00ff00' },
]

const world = { x: 0, y: 0, w: 200, h: 100 }

const baseProps = {
  lines, world,
  isZooming: false,
  draggingEndpointId: null,
  draggingId: null,
  draggingLayerId: null,
  isLive: true,
  hoveredLineId: null,
  selectedLineIds: [] as string[],
}

describe('FlowDots — visibility gating', () => {
  it('isLive=true renders a circle for every line', () => {
    const { container } = render(<FlowDots {...baseProps} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('isLive=false without hover/selection renders nothing', () => {
    const { container } = render(<FlowDots {...baseProps} isLive={false} />)
    expect(container.querySelectorAll('circle').length).toBe(0)
  })

  it('hoveredLineId surfaces only that one line', () => {
    const { container } = render(
      <FlowDots {...baseProps} isLive={false} hoveredLineId="l2" />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(1)
    expect(circles[0].getAttribute('fill')).toBe('#00ff00')
  })

  it('selectedLineIds surfaces every listed line', () => {
    const { container } = render(
      <FlowDots {...baseProps} isLive={false} selectedLineIds={['l1', 'l2']} />,
    )
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('dragging an endpoint hides all dots (the line being dragged AND the others get dimmed out)', () => {
    const { container } = render(
      <FlowDots {...baseProps} draggingEndpointId="l1" />,
    )
    expect(container.querySelectorAll('circle').length).toBe(0)
  })

  it('dragging a node hides all dots globally', () => {
    const { container } = render(<FlowDots {...baseProps} draggingId="n1" />)
    expect(container.querySelectorAll('circle').length).toBe(0)
  })

  it('dragging a layer hides all dots globally', () => {
    const { container } = render(<FlowDots {...baseProps} draggingLayerId="L1" />)
    expect(container.querySelectorAll('circle').length).toBe(0)
  })
})

describe('FlowDots — animation duration', () => {
  it('uses default 2.5s when flowDuration is unset', () => {
    const { container } = render(<FlowDots {...baseProps} />)
    const motion = container.querySelector('animateMotion')
    expect(motion?.getAttribute('dur')).toBe('2.5s')
  })

  it('uses the configured flowDuration', () => {
    const withDur = [{ ...lines[0], flowDuration: 1 }]
    const { container } = render(<FlowDots {...baseProps} lines={withDur} />)
    expect(container.querySelector('animateMotion')?.getAttribute('dur')).toBe('1s')
  })

  it('bidirectional lines double the duration (there-and-back)', () => {
    const bidir = [{ ...lines[0], biDirectional: true, flowDuration: 2 }]
    const { container } = render(<FlowDots {...baseProps} lines={bidir} />)
    const motion = container.querySelector('animateMotion')
    expect(motion?.getAttribute('dur')).toBe('4s')
    expect(motion?.getAttribute('keyPoints')).toBe('0;1;0')
    expect(motion?.getAttribute('keyTimes')).toBe('0;0.5;1')
  })

  it('unidirectional motion uses 0→1 key points', () => {
    const { container } = render(<FlowDots {...baseProps} />)
    const motion = container.querySelector('animateMotion')
    expect(motion?.getAttribute('keyPoints')).toBe('0;1')
    expect(motion?.getAttribute('keyTimes')).toBe('0;1')
  })
})

describe('FlowDots — zoom pause', () => {
  it('isZooming adds the paused-animations class', () => {
    const { container } = render(<FlowDots {...baseProps} isZooming />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('class')).toContain('paused-animations')
  })

  it('isZooming=false omits the paused-animations class', () => {
    const { container } = render(<FlowDots {...baseProps} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('class')).not.toContain('paused-animations')
  })
})
