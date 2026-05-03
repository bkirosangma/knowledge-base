import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { StubRepositoryProvider, type Repositories } from "../../../shell/RepositoryContext";
import { FileSystemError } from "../../../domain/errors";
import { useTabContent } from "./useTabContent";

function renderWithTab(
  path: string | null,
  tab: Partial<Repositories["tab"]> | null,
  initialPath?: string | null,
) {
  const stub: Repositories = {
    attachment: null, document: null, diagram: null,
    linkIndex: null, svg: null, vaultConfig: null,
    tab: tab as Repositories["tab"], tabRefs: null,
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StubRepositoryProvider, { value: stub, children });
  return renderHook(({ p }: { p: string | null }) => useTabContent(p), {
    wrapper,
    initialProps: { p: initialPath !== undefined ? initialPath : path },
  });
}

describe("useTabContent", () => {
  let read: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    read = vi.fn(async () => "");
    write = vi.fn(async () => {});
  });

  it("loads the file content when the path changes", async () => {
    read.mockResolvedValue("\\title \"x\"\n.");
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.content).toBe("\\title \"x\"\n."));
    expect(read).toHaveBeenCalledWith("song.alphatex");
    expect(result.current.loadError).toBeNull();
  });

  it("captures FileSystemError on load failure", async () => {
    read.mockRejectedValue(new FileSystemError("malformed", "bad"));
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(FileSystemError));
    expect(result.current.content).toBeNull();
  });

  it("clears prior content when the path changes to null", async () => {
    read.mockResolvedValue("first");
    const stub: Repositories = {
      attachment: null, document: null, diagram: null,
      linkIndex: null, svg: null, vaultConfig: null,
      tab: { read, write } as Repositories["tab"], tabRefs: null,
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StubRepositoryProvider, { value: stub, children });
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useTabContent(path),
      { wrapper, initialProps: { path: "a.alphatex" as string | null } },
    );
    await waitFor(() => expect(result.current.content).toBe("first"));
    rerender({ path: null });
    await waitFor(() => expect(result.current.content).toBeNull());
  });

  it("refresh() re-reads the file from disk", async () => {
    read.mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.content).toBe("v1"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.content).toBe("v2");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
