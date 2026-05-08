import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("renders textarea + send button", () => {
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("submits on Enter", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox");
    await userEvent.type(tx, "hello");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("inserts newline on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(tx, "line1");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.type(tx, "line2");
    expect(onSend).not.toHaveBeenCalled();
    expect(tx.value).toBe("line1\nline2");
  });

  it("clears textarea after send", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(tx, "hi");
    await userEvent.keyboard("{Enter}");
    expect(tx.value).toBe("");
  });

  it("shows stop button while streaming", () => {
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("fires onInterrupt when stop clicked", async () => {
    const onInterrupt = vi.fn();
    render(<Composer onSend={vi.fn()} onInterrupt={onInterrupt} isStreaming />);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("does not submit empty messages", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
