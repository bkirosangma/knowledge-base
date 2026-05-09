import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

vi.mock("../../infrastructure/settingsStore", () => ({
  getClaudeSurface: vi.fn().mockResolvedValue("terminal"),
  setClaudeSurface: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../claude/SurfaceContext", () => ({
  useSurface: vi.fn(),
}));

import { getClaudeSurface, setClaudeSurface } from "../../infrastructure/settingsStore";
import { useSurface } from "../claude/SurfaceContext";
import { RegisterSurfaceCommand } from "./registerSurfaceCommand";
import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../../shared/context/CommandRegistry";

/** Helper: renders RegisterSurfaceCommand inside a provider and returns
 *  the live command list via a sibling consumer component. */
function renderWithRegistry() {
  let capturedCommands: ReturnType<typeof useCommandRegistry>["commands"] = [];

  function Consumer() {
    const { commands } = useCommandRegistry();
    capturedCommands = commands;
    return null;
  }

  const result = render(
    <CommandRegistryProvider>
      <RegisterSurfaceCommand />
      <Consumer />
    </CommandRegistryProvider>,
  );

  return { result, getCommands: () => capturedCommands };
}

describe("RegisterSurfaceCommand", () => {
  beforeEach(() => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    vi.mocked(setClaudeSurface).mockResolvedValue(undefined);
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface: vi.fn() });
  });

  it("TERM-14.3-01: command appears in registry with id 'claude.toggleSurface'", () => {
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    expect(cmd).toBeDefined();
    expect(cmd?.title).toContain("Toggle Claude surface");
    expect(cmd?.group).toBe("Claude");
  });

  it("TERM-14.3-02: run flips setting from terminal to chat", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    const setSurface = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface });
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(setSurface).toHaveBeenCalledWith("chat");
  });

  it("TERM-14.3-03: run flips setting from chat to terminal", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("chat");
    const setSurface = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSurface).mockReturnValue({ surface: "chat", setSurface });
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(setSurface).toHaveBeenCalledWith("terminal");
  });

  it("TERM-14.3-04: setSurface is called with the new value after flip", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    const setSurface = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface });
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(setSurface).toHaveBeenCalledWith("chat");
  });
});
