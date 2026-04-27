import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import SVGEditorView from './SVGEditorView';

vi.mock('./components/SVGCanvas', () => {
  const MockSVGCanvas = React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      getSvgString: () => '<svg></svg>',
      setSvgString: vi.fn(),
      setMode: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomFit: vi.fn(),
    }));
    return <div data-testid="svg-canvas" />;
  });
  MockSVGCanvas.displayName = 'MockSVGCanvas';
  return { default: MockSVGCanvas };
});

vi.mock('./hooks/useSVGPersistence', () => ({
  useSVGPersistence: vi.fn().mockReturnValue({
    isDirty: false,
    onChanged: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
    flush: vi.fn(),
  }),
}));

describe('SVGEditorView', () => {
  const onSVGEditorBridge = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SVG-6.2-01: renders PaneHeader with the filename as title', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="diagrams/logo.svg"
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(screen.getByText('logo')).toBeInTheDocument();
  });

  it('renders SVGToolbar', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="logo.svg"
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(screen.getByTitle('Select (S)')).toBeInTheDocument();
  });

  it('emits bridge with isDirty=false on mount', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="logo.svg"
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(onSVGEditorBridge).toHaveBeenCalledWith(
      expect.objectContaining({ isDirty: false })
    );
  });
});
