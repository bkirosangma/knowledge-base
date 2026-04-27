import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SVGToolbar from './SVGToolbar';
import type { SVGTool } from './SVGCanvas';

describe('SVGToolbar', () => {
  const defaultProps = {
    activeTool: 'select' as SVGTool,
    onToolChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomFit: vi.fn(),
    onFillChange: vi.fn(),
    onStrokeChange: vi.fn(),
    onStrokeWidthChange: vi.fn(),
    linkedHandles: true,
    onLinkedHandlesChange: vi.fn(),
  };

  it('SVG-6.3-01: renders all tool buttons', () => {
    render(<SVGToolbar {...defaultProps} />);
    expect(screen.getByTitle('Select (S)')).toBeInTheDocument();
    expect(screen.getByTitle('Rectangle (R)')).toBeInTheDocument();
    expect(screen.getByTitle('Ellipse (E)')).toBeInTheDocument();
    expect(screen.getByTitle('Line (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Path (P)')).toBeInTheDocument();
    expect(screen.getByTitle('Text (T)')).toBeInTheDocument();
  });

  it('SVG-6.3-02: calls onToolChange with correct tool when a tool button is clicked', () => {
    const onToolChange = vi.fn();
    render(<SVGToolbar {...defaultProps} onToolChange={onToolChange} />);
    fireEvent.click(screen.getByTitle('Rectangle (R)'));
    expect(onToolChange).toHaveBeenCalledWith('rect');
  });

  it('SVG-6.3-02: highlights the active tool', () => {
    render(<SVGToolbar {...defaultProps} activeTool="rect" />);
    const rectBtn = screen.getByTitle('Rectangle (R)');
    expect(rectBtn).toHaveAttribute('data-active', 'true');
  });

  it('SVG-6.3-03: calls onUndo when Undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<SVGToolbar {...defaultProps} onUndo={onUndo} />);
    fireEvent.click(screen.getByTitle('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('SVG-6.3-03: calls onRedo when Redo button is clicked', () => {
    const onRedo = vi.fn();
    render(<SVGToolbar {...defaultProps} onRedo={onRedo} />);
    fireEvent.click(screen.getByTitle('Redo'));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('SVG-6.3-04: calls onZoomIn when Zoom In button is clicked', () => {
    const onZoomIn = vi.fn();
    render(<SVGToolbar {...defaultProps} onZoomIn={onZoomIn} />);
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('SVG-6.3-04: calls onZoomFit when Fit button is clicked', () => {
    const onZoomFit = vi.fn();
    render(<SVGToolbar {...defaultProps} onZoomFit={onZoomFit} />);
    fireEvent.click(screen.getByTitle('Fit'));
    expect(onZoomFit).toHaveBeenCalledTimes(1);
  });
});
