import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "./shell/RepositoryContext";
import { StubShellErrorProvider } from "./shell/ShellErrorContext";
import { renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";

vi.mock("./features/tab/hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: "ready",
    metadata: null,
    error: null,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: false,
    session: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
  }),
}));

function wrap(children: ReactNode) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() },
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("tab pane routing", () => {
  it("renders TabView with the file path for entries with fileType=\"tab\"", () => {
    render(wrap(renderTabPaneEntry({ filePath: "songs/intro.alphatex", fileType: "tab" })!));
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("returns null for non-tab fileType", () => {
    expect(
      renderTabPaneEntry({ filePath: "x.md", fileType: "document" }),
    ).toBeNull();
  });
});
