import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { RepositoryProvider, useRepositories } from "./RepositoryContext";

describe("RepositoryProvider", () => {
  it("provides a TabRepository when a vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath="/tmp/test-vault">
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).not.toBeNull();
    expect(typeof result.current.tab?.read).toBe("function");
    expect(typeof result.current.tab?.write).toBe("function");
  });

  it("provides null repos when no vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).toBeNull();
  });

  it("RepositoryProvider exposes tabRefs when a vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath="/tmp/test-vault">
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tabRefs).not.toBeNull();
    expect(typeof result.current.tabRefs!.read).toBe("function");
  });

  it("RepositoryProvider sets tabRefs = null when no vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tabRefs).toBeNull();
  });

  it("RepositoryProvider exposes svgRefs when a vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath="/tmp/test-vault">
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.svgRefs).not.toBeNull();
    expect(typeof result.current.svgRefs!.read).toBe("function");
    expect(typeof result.current.svgRefs!.write).toBe("function");
  });

  it("RepositoryProvider sets svgRefs = null when no vaultPath is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider vaultPath={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.svgRefs).toBeNull();
  });
});
