import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { RepositoryProvider, useRepositories } from "./RepositoryContext";

describe("RepositoryProvider", () => {
  it("provides a TabRepository when a rootHandle is mounted", () => {
    const fakeHandle = {
      kind: "directory",
      name: "vault",
      async getDirectoryHandle() { return fakeHandle; },
      async getFileHandle() { throw new Error("not used"); },
    } as unknown as FileSystemDirectoryHandle;

    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={fakeHandle}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).not.toBeNull();
    expect(typeof result.current.tab?.read).toBe("function");
    expect(typeof result.current.tab?.write).toBe("function");
  });

  it("provides null repos when no rootHandle is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).toBeNull();
  });

  it("RepositoryProvider exposes tabRefs when a rootHandle is mounted", () => {
    const fakeHandle = {
      kind: "directory",
      name: "vault",
      async getDirectoryHandle() { return fakeHandle; },
      async getFileHandle() { throw new Error("not used"); },
    } as unknown as FileSystemDirectoryHandle;

    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={fakeHandle}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tabRefs).not.toBeNull();
    expect(typeof result.current.tabRefs!.read).toBe("function");
  });

  it("RepositoryProvider sets tabRefs = null when no rootHandle is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tabRefs).toBeNull();
  });
});
