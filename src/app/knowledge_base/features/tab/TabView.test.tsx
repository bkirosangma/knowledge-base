import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";

const mountIntoMock = vi.fn();
let mockStatus: string = "idle";
let mockMetadata: { title: string } | null = null;
let mockError: Error | null = null;

vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,
    session: null,
    mountInto: mountIntoMock,
  }),
}));

vi.mock("../../shared/hooks/useObservedTheme", () => ({
  useObservedTheme: () => "light",
}));

vi.mock("./hooks/useTabPlayback", () => ({
  useTabPlayback: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setTempoFactor: vi.fn(),
    setLoop: vi.fn(),
    audioBlocked: false,
    currentTick: 0,
    playerStatus: "paused" as const,
  }),
}));

import { TabView } from "./TabView";

function Wrap({ children, read = vi.fn().mockResolvedValue("\\title \"hi\"\n.") }: {
  children: ReactNode;
  read?: (tabPath: string) => Promise<string>;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read, write: vi.fn() },
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("TabView", () => {
  beforeEach(() => {
    mountIntoMock.mockReset().mockResolvedValue(undefined);
    mockStatus = "idle";
    mockMetadata = null;
    mockError = null;
  });

  it("calls mountInto with the loaded file content", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalled());
    expect(mountIntoMock.mock.calls[0][1]).toBe("\\title \"hi\"\n.");
  });

  it("shows the loading placeholder while status is 'mounting'", async () => {
    mockStatus = "mounting";
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-loading")).toBeInTheDocument();
  });

  it("renders the canvas host when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { title: "hi" } as never;
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("renders the engine-load-error pane with a Reload button", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-engine-error")).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: /reload/i });
    expect(reload).toBeInTheDocument();
  });

  it("Reload button on engine-load-error re-invokes mountInto", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("first attempt failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(mountIntoMock).toHaveBeenCalledTimes(2);
  });

  it("source-parse errors (status='error') route through useShellErrors", async () => {
    const reportError = vi.fn();
    mockStatus = "error";
    mockError = new Error("parse fail");
    render(
      <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
        <StubRepositoryProvider
          value={{
            attachment: null, document: null, diagram: null,
            linkIndex: null, svg: null, vaultConfig: null,
            tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() },
          }}
        >
          <TabView filePath="bad.alphatex" />
        </StubRepositoryProvider>
      </StubShellErrorProvider>,
    );
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(reportError.mock.calls[0][0]).toBe(mockError);
    expect(reportError.mock.calls[0][1]).toMatch(/bad\.alphatex/);
  });

  it("mounts the toolbar when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { title: "hi" } as never;
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-toolbar")).toBeInTheDocument();
  });

  it("does not mount the toolbar in engine-load-error state", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.queryByTestId("tab-toolbar")).not.toBeInTheDocument();
  });
});
