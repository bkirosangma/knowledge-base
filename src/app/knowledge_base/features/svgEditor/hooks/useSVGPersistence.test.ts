import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSVGPersistence } from './useSVGPersistence';
import type { SVGCanvasHandle } from '../components/SVGCanvas';
import * as helpers from '../../../shared/hooks/fileExplorerHelpers';

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
const EDITED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect/></svg>';

vi.mock('../../../shared/hooks/fileExplorerHelpers', () => ({
  resolveParentHandle: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const mockResolveParentHandle = helpers.resolveParentHandle as ReturnType<typeof vi.fn>;
const mockReadFile = helpers.readTextFile as ReturnType<typeof vi.fn>;
const mockWriteFile = helpers.writeTextFile as ReturnType<typeof vi.fn>;

function makeCanvas(svgContent = EMPTY_SVG): SVGCanvasHandle & { _content: string } {
  const canvas = {
    _content: svgContent,
    getSvgString: vi.fn(() => canvas._content),
    setSvgString: vi.fn((s: string) => { canvas._content = s; }),
    setMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clearSelection: vi.fn(),
    deleteSelected: vi.fn(),
    duplicateSelected: vi.fn(),
    copySelected: vi.fn(),
    paste: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomFit: vi.fn(),
    setFill: vi.fn(),
    setStroke: vi.fn(),
    setStrokeWidth: vi.fn(),
    setLinkedHandles: vi.fn(),
    finishOpenPath: vi.fn(),
  };
  return canvas;
}

function makeRef<T>(val: T) {
  return { current: val };
}

const dirHandleRef = makeRef({} as FileSystemDirectoryHandle);

describe('useSVGPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fakeParentHandle = {
      getFileHandle: vi.fn().mockResolvedValue({}),
    } as unknown as FileSystemDirectoryHandle;
    mockResolveParentHandle.mockResolvedValue(fakeParentHandle);
    mockReadFile.mockResolvedValue(EMPTY_SVG);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('starts with isDirty = false', () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence(null, dirHandleRef, canvasRef)
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('loads file content when activeFile is set', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    expect(canvas.setSvgString).toHaveBeenCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-01: sets isDirty to true when onChanged is called', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
  });

  it('SVG-6.4-02: handleSave writes getSvgString output and resets isDirty', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    // Simulate edits made after load
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.handleSave(); });
    expect(mockWriteFile).toHaveBeenCalledWith(
      dirHandleRef.current, 'drawing.svg', EDITED_SVG
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-03: handleDiscard re-reads the file and resets isDirty', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    act(() => { result.current.onChanged(); });
    await act(async () => { await result.current.handleDiscard(); });
    expect(canvas.setSvgString).toHaveBeenLastCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });
});
