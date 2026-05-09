import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn(function () {
    return {
      rows: 24,
      cols: 80,
      open: vi.fn(),
      write: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
    };
  }),
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function () {
    return { fit: vi.fn() };
  }),
}));
vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn(function () {
    return {};
  }),
}));
vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    termOpen: vi.fn(() => Promise.resolve()),
    termWrite: vi.fn(() => Promise.resolve()),
    termResize: vi.fn(() => Promise.resolve()),
    subscribeTermEvent: vi.fn(() => Promise.resolve(() => {})),
  },
}));

vi.mock("../claude/ChatContext", () => ({
  useChat: () => ({ isOpen: true }),
}));

// CSS import needs a stub so jsdom doesn't choke.
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { TerminalSurface } from "./TerminalSurface";

describe("TerminalSurface", () => {
  it("TERM-14.1-05: renders the container with role=region", () => {
    render(<TerminalSurface vaultPath="/v" />);
    expect(
      screen.getByRole("region", { name: "Claude terminal" }),
    ).toBeInTheDocument();
  });
});
