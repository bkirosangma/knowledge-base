import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { createRef } from 'react';
import SVGCanvas, { type SVGCanvasHandle } from './SVGCanvas';

const mockGetSvgString = vi.fn().mockReturnValue('<svg></svg>');
const mockSetSvgString = vi.fn().mockReturnValue(true);
const mockSetMode = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockSetZoom = vi.fn();
const mockGetZoom = vi.fn().mockReturnValue(1);
const mockBind = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockSvgCanvas = vi.fn(function (this: any, container: HTMLElement) {
  // Must use a regular function (not arrow) so `new` receives the return value.
  // Inject a stand-in `#svgcontent` SVG element so the production
  // MutationObserver fallback (KB-005a) has something to attach to.
  // The real library does this during init.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'svgcontent';
  container.appendChild(svg);
  Object.assign(this, {
    getSvgString: mockGetSvgString,
    setSvgString: mockSetSvgString,
    setMode: mockSetMode,
    undoMgr: { undo: mockUndo, redo: mockRedo },
    setZoom: mockSetZoom,
    getZoom: mockGetZoom,
    bind: mockBind,
  });
});

vi.mock('@svgedit/svgcanvas', () => ({ default: MockSvgCanvas }));

describe('SVGCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes SvgCanvas on mount', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    expect(MockSvgCanvas).toHaveBeenCalledTimes(1);
  });

  it('exposes getSvgString via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    const result = ref.current?.getSvgString();
    expect(mockGetSvgString).toHaveBeenCalled();
    expect(result).toBe('<svg></svg>');
  });

  it('exposes setSvgString via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    ref.current?.setSvgString('<svg><rect/></svg>');
    expect(mockSetSvgString).toHaveBeenCalledWith('<svg><rect/></svg>');
  });

  it('exposes setMode via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    ref.current?.setMode('rect');
    expect(mockSetMode).toHaveBeenCalledWith('rect');
  });

  it('calls onChanged when canvas fires changed event', async () => {
    const onChanged = vi.fn();
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={onChanged} />);
    });
    const boundCallback = mockBind.mock.calls.find(([event]) => event === 'changed')?.[1];
    expect(boundCallback).toBeDefined();
    boundCallback?.();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('SVG-6.4-17: MutationObserver fallback fires onChanged on shape-attribute mutations (move-shape gap)', async () => {
    const onChanged = vi.fn();
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={onChanged} />);
    });
    // Simulate the user dragging an existing rect — `@svgedit/svgcanvas`
    // 7.x omits a `changed` call for select-mode mouseup translates
    // (event.js:646), so the only signal we have is the DOM mutation.
    const svgcontent = document.getElementById('svgcontent')!
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    svgcontent.appendChild(rect)
    await new Promise((r) => setTimeout(r, 0))
    // Translate the rect.
    rect.setAttribute('transform', 'translate(50 50)')
    await new Promise((r) => setTimeout(r, 0))
    expect(onChanged).toHaveBeenCalled()
  });

  it('SVG-6.4-18: MutationObserver is suppressed during programmatic setSvgString load', async () => {
    const onChanged = vi.fn();
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={onChanged} />);
    });
    onChanged.mockClear();
    // setSvgString sets the suppression flag, mutates the DOM, and clears
    // the flag on the next macrotask. Observer mutations during that
    // window must not look like user edits.
    act(() => { ref.current?.setSvgString('<svg><rect/></svg>'); });
    const svgcontent = document.getElementById('svgcontent')!
    svgcontent.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'rect'))
    await new Promise((r) => setTimeout(r, 0))
    expect(onChanged).not.toHaveBeenCalled()
  });
});
