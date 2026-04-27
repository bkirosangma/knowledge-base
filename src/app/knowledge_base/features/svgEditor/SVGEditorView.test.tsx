import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import SVGEditorView from './SVGEditorView';

vi.mock('./components/SVGCanvas', () => ({
  default: React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
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
  }),
}));

vi.mock('./hooks/useSVGPersistence', () => ({
  useSVGPersistence: vi.fn().mockReturnValue({
    isDirty: false,
    onChanged: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
  }),
}));

const mockFileExplorer = {
  dirHandleRef: { current: {} as FileSystemDirectoryHandle },
  tree: [],
  activeFile: null,
  isLoading: false,
  supported: true,
  dirtyFiles: new Set<string>(),
  pendingFile: null,
  clearPendingFile: vi.fn(),
  openFolder: vi.fn(),
  selectFile: vi.fn(),
  saveFile: vi.fn(),
  createFile: vi.fn(),
  createDocument: vi.fn(),
  createSVG: vi.fn(),
  createFolder: vi.fn(),
  deleteFile: vi.fn(),
  deleteFolder: vi.fn(),
  renameFile: vi.fn(),
  renameFolder: vi.fn(),
  duplicateFile: vi.fn(),
  moveItem: vi.fn(),
  discardFile: vi.fn(),
  markDirty: vi.fn(),
  refresh: vi.fn(),
  watcherRescan: vi.fn(),
  handleFallbackInput: vi.fn(),
  inputRef: { current: null },
  setActiveFile: vi.fn(),
  rootHandle: null,
  directoryName: 'vault',
};

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
          fileExplorer={mockFileExplorer as any}
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
          fileExplorer={mockFileExplorer as any}
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
          fileExplorer={mockFileExplorer as any}
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(onSVGEditorBridge).toHaveBeenCalledWith(
      expect.objectContaining({ isDirty: false })
    );
  });
});
