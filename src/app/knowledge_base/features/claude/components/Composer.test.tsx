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

  it("CHAT-12.3-10: slash palette opens on '/'", async () => {
    const user = userEvent.setup();
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming={false} />);
    const ta = screen.getByLabelText("Message Claude");
    await user.type(ta, "/");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("CHAT-12.3-11: typing space closes the palette", async () => {
    const user = userEvent.setup();
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming={false} />);
    const ta = screen.getByLabelText("Message Claude");
    await user.type(ta, "/ ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("CHAT-12.3-12: ArrowDown then Enter inserts the next template", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const ta = screen.getByLabelText("Message Claude") as HTMLTextAreaElement;
    await user.type(ta, "/");                  // palette opens, highlight=0 (create)
    await user.keyboard("{ArrowDown}");        // highlight=1 (diagram)
    await user.keyboard("{Enter}");            // insert "/kb diagram "
    expect(ta.value).toBe("/kb diagram ");
    // Enter inserted the template; palette should be closed (no longer matches /^\/[a-z-]*$/).
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("CHAT-12.3-13: Escape dismisses palette without inserting", async () => {
    const user = userEvent.setup();
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming={false} />);
    const ta = screen.getByLabelText("Message Claude") as HTMLTextAreaElement;
    await user.type(ta, "/d");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    // Textarea retains the user's "/d" plus the dismiss space.
    expect(ta.value).toBe("/d ");
  });
});
