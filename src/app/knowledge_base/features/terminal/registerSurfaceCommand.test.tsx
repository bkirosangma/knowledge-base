import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

vi.mock("../../infrastructure/settingsStore", () => ({
  getClaudeSurface: vi.fn().mockResolvedValue("terminal"),
  setClaudeSurface: vi.fn().mockResolvedValue(undefined),
}));

import { getClaudeSurface, setClaudeSurface } from "../../infrastructure/settingsStore";
import { RegisterSurfaceCommand } from "./registerSurfaceCommand";
import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../../shared/context/CommandRegistry";

/** Helper: renders RegisterSurfaceCommand inside a provider and returns
 *  the live command list via a sibling consumer component. */
function renderWithRegistry(onSurfaceChange?: (s: string) => void) {
  let capturedCommands: ReturnType<typeof useCommandRegistry>["commands"] = [];

  function Consumer() {
    const { commands } = useCommandRegistry();
    capturedCommands = commands;
    return null;
  }

  const result = render(
    <CommandRegistryProvider>
      <RegisterSurfaceCommand onSurfaceChange={onSurfaceChange as never} />
      <Consumer />
    </CommandRegistryProvider>,
  );

  return { result, getCommands: () => capturedCommands };
}

describe("RegisterSurfaceCommand", () => {
  beforeEach(() => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    vi.mocked(setClaudeSurface).mockResolvedValue(undefined);
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
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(setClaudeSurface).toHaveBeenCalledWith("chat");
  });

  it("TERM-14.3-03: run flips setting from chat to terminal", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("chat");
    const { getCommands } = renderWithRegistry();
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(setClaudeSurface).toHaveBeenCalledWith("terminal");
  });

  it("TERM-14.3-04: onSurfaceChange callback fires after flip", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    const onSurfaceChange = vi.fn();
    const { getCommands } = renderWithRegistry(onSurfaceChange);
    const cmd = getCommands().find((c) => c.id === "claude.toggleSurface");
    await act(async () => {
      await cmd?.run();
    });
    expect(onSurfaceChange).toHaveBeenCalledWith("chat");
  });
});
