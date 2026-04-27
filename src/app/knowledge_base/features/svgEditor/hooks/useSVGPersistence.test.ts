import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useSVGPersistence } from './useSVGPersistence';
import type { SVGCanvasHandle } from '../components/SVGCanvas';
import {
  StubRepositoryProvider,
  type Repositories,
} from '../../../shell/RepositoryContext';
import { StubShellErrorProvider } from '../../../shell/ShellErrorContext';
import { FileSystemError } from '../../../domain/errors';

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
const EDITED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect/></svg>';

function makeCanvas(initial = EMPTY_SVG) {
  const canvas: SVGCanvasHandle & { _content: string } = {
    _content: initial,
    getSvgString: vi.fn(() => canvas._content),
    setSvgString: vi.fn((s: string) => { canvas._content = s; }),
    setMode: vi.fn(),
    clearSelection: vi.fn(),
    deleteSelected: vi.fn(),
    duplicateSelected: vi.fn(),
    copySelected: vi.fn(),
    paste: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomFit: vi.fn(),
    setFill: vi.fn(),
    setStroke: vi.fn(),
    setStrokeWidth: vi.fn(),
    setLinkedHandles: vi.fn(),
    finishOpenPath: vi.fn(),
    setBackground: vi.fn(),
    resize: vi.fn(),
  };
  return canvas;
}

function makeRef<T>(val: T) {
  return { current: val };
}

interface HarnessOpts {
  read?: (path: string) => Promise<string>;
  write?: (path: string, svg: string) => Promise<void>;
  reportError?: (e: unknown, ctx?: string) => void;
}

function makeWrapper(opts: HarnessOpts) {
  const stub: Repositories = {
    attachment: null,
    diagram: null,
    document: null,
    linkIndex: null,
    svg: {
      read: opts.read ?? vi.fn().mockResolvedValue(EMPTY_SVG),
      write: opts.write ?? vi.fn().mockResolvedValue(undefined),
    },
    vaultConfig: null,
  };
  const reportError = opts.reportError ?? vi.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const repoNode = createElement(StubRepositoryProvider, { value: stub, children });
    return createElement(StubShellErrorProvider, {
      value: { current: null, reportError, dismiss: () => {} },
      children: repoNode,
    });
  };
  Wrapper.displayName = 'SVGPersistenceTestWrapper';
  return Wrapper;
}

describe('useSVGPersistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with isDirty = false', () => {
    const canvas = makeCanvas();
    const { result } = renderHook(
      () => useSVGPersistence(null, makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({}) },
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('loads file content via repo.read when activeFile is set', async () => {
    const canvas = makeCanvas();
    const read = vi.fn().mockResolvedValue(EMPTY_SVG);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ read }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(read).toHaveBeenCalledWith('drawing.svg');
    expect(canvas.setSvgString).toHaveBeenCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-01: sets isDirty to true when onChanged is called', async () => {
    const canvas = makeCanvas();
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({}) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
  });

  it('SVG-6.4-02: handleSave writes getSvgString output and resets isDirty', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.handleSave(); });
    expect(write).toHaveBeenCalledWith('drawing.svg', EDITED_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-03: handleDiscard re-reads the file and resets isDirty', async () => {
    const canvas = makeCanvas();
    const read = vi.fn().mockResolvedValue(EMPTY_SVG);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ read }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { result.current.onChanged(); });
    await act(async () => { await result.current.handleDiscard(); });
    expect(canvas.setSvgString).toHaveBeenLastCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-04: autosave fires after 200ms of inactivity', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(write).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(199); });
    expect(write).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(write).toHaveBeenCalledWith('drawing.svg', EDITED_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('SVG-6.4-05: handleSave failure leaves isDirty=true and reports the error', async () => {
    const canvas = makeCanvas();
    const reportError = vi.fn();
    const write = vi.fn().mockRejectedValue(new FileSystemError('permission', 'denied'));
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write, reportError }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    await act(async () => { await result.current.handleSave(); });
    expect(result.current.isDirty).toBe(true);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'permission' }),
      'Saving drawing.svg',
    );
  });

  it('SVG-6.4-06: debounced autosave failure leaves isDirty=true and reports the error', async () => {
    const canvas = makeCanvas();
    const reportError = vi.fn();
    const write = vi.fn().mockRejectedValue(new FileSystemError('quota-exceeded', 'full'));
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write, reportError }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(write).toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'quota-exceeded' }),
      'Saving drawing.svg',
    );
  });

  it('SVG-6.4-07: load failure surfaces via reportError', async () => {
    const canvas = makeCanvas();
    const reportError = vi.fn();
    const read = vi.fn().mockRejectedValue(new FileSystemError('permission', 'denied'));
    renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ read, reportError }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'permission' }),
      'Loading drawing.svg',
    );
  });

  it('SVG-6.4-08: discard failure surfaces via reportError without resetting isDirty', async () => {
    const canvas = makeCanvas();
    const reportError = vi.fn();
    // First read (load) succeeds, second (discard) fails.
    const read = vi.fn()
      .mockResolvedValueOnce(EMPTY_SVG)
      .mockRejectedValueOnce(new FileSystemError('permission', 'denied'));
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ read, reportError }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { result.current.onChanged(); });
    await act(async () => { await result.current.handleDiscard(); });
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'permission' }),
      'Discarding changes to drawing.svg',
    );
    expect(result.current.isDirty).toBe(true);
  });

  it('SVG-6.4-09: pending edit is flushed on unmount (close-tab-within-200ms guarantee)', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(write).not.toHaveBeenCalled();
    // Unmount before debounce fires.
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(write).toHaveBeenCalledWith('drawing.svg', EDITED_SVG);
  });

  it('SVG-6.4-10: switching activeFile flushes the pending write to the previous path', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValue(EMPTY_SVG);
    const { result, rerender } = renderHook(
      ({ p }) => useSVGPersistence(p, makeRef<SVGCanvasHandle>(canvas)),
      {
        wrapper: makeWrapper({ read, write }),
        initialProps: { p: 'a.svg' as string | null },
      },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      rerender({ p: 'b.svg' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(write).toHaveBeenCalledWith('a.svg', EDITED_SVG);
  });

  it('SVG-6.4-11: window blur flushes pending edit', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    canvas._content = EDITED_SVG;
    act(() => { result.current.onChanged(); });
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(write).toHaveBeenCalledWith('drawing.svg', EDITED_SVG);
  });

  it('SVG-6.4-12: explicit flush() on a clean editor is a no-op', async () => {
    const canvas = makeCanvas();
    const write = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useSVGPersistence('drawing.svg', makeRef<SVGCanvasHandle>(canvas)),
      { wrapper: makeWrapper({ write }) },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { result.current.flush(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(write).not.toHaveBeenCalled();
  });
});
