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
const MockSvgCanvas = vi.fn(function (this: any) {
  // Must use a regular function (not arrow) so `new` receives the return value
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
});
