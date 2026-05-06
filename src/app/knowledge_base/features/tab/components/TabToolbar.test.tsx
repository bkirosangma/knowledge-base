import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabToolbar } from "./TabToolbar";

function makeProps(overrides: Partial<React.ComponentProps<typeof TabToolbar>> = {}) {
  return {
    playerStatus: "paused" as const,
    isAudioReady: true,
    audioBlocked: false,
    onToggle: vi.fn(),
    onStop: vi.fn(),
    looping: false,
    onSetLooping: vi.fn(),
    tempoBpm: 120,
    ...overrides,
  };
}

describe("TabToolbar", () => {
  it("renders a play button when playerStatus is 'paused'", () => {
    render(<TabToolbar {...makeProps()} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("renders a pause button when playerStatus is 'playing'", () => {
    render(<TabToolbar {...makeProps({ playerStatus: "playing" })} />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("the play/pause button calls onToggle on click", async () => {
    const onToggle = vi.fn();
    render(<TabToolbar {...makeProps({ onToggle })} />);
    await userEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("play/pause is disabled when isAudioReady is false", () => {
    render(<TabToolbar {...makeProps({ isAudioReady: false })} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeDisabled();
  });

  it("stop is disabled when isAudioReady is false", () => {
    render(<TabToolbar {...makeProps({ isAudioReady: false })} />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeDisabled();
  });

  it("stop button calls onStop on click", async () => {
    const onStop = vi.fn();
    render(<TabToolbar {...makeProps({ onStop })} />);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("tempo input commits BPM via onSetTempoBpm on blur when editable", async () => {
    const onSetTempoBpm = vi.fn();
    render(<TabToolbar {...makeProps({ tempoBpm: 100, onSetTempoBpm })} />);
    const input = screen.getByLabelText(/tempo/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "140");
    await userEvent.tab();
    expect(onSetTempoBpm).toHaveBeenLastCalledWith(140);
  });

  it("tempo renders as static text (not an input) when onSetTempoBpm is omitted", () => {
    render(<TabToolbar {...makeProps({ tempoBpm: 100 })} />);
    // No editable input present.
    expect(screen.queryByRole("spinbutton", { name: /tempo/i })).toBeNull();
    // Static span with the BPM value is.
    expect(screen.getByLabelText(/tempo/i)).toHaveTextContent("100");
  });

  it("tempo input rejects out-of-range BPM by snapping back to current value", async () => {
    const onSetTempoBpm = vi.fn();
    render(<TabToolbar {...makeProps({ tempoBpm: 100, onSetTempoBpm })} />);
    const input = screen.getByLabelText(/tempo/i) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "9999");
    await userEvent.tab();
    expect(onSetTempoBpm).not.toHaveBeenCalled();
    expect(input.value).toBe("100");
  });

  it("loop checkbox toggles onSetLooping with the boolean state", async () => {
    const onSetLooping = vi.fn();
    // The checkbox is controlled — `looping` drives `checked`, so the
    // parent must rerender with the new value between clicks for the next
    // click to fire the opposite state.
    const { rerender } = render(<TabToolbar {...makeProps({ looping: false, onSetLooping })} />);
    const checkbox = screen.getByRole("checkbox", { name: /loop/i });
    await userEvent.click(checkbox);
    expect(onSetLooping).toHaveBeenLastCalledWith(true);
    rerender(<TabToolbar {...makeProps({ looping: true, onSetLooping })} />);
    await userEvent.click(checkbox);
    expect(onSetLooping).toHaveBeenLastCalledWith(false);
  });

  it("renders the audio-blocked hint when audioBlocked is true", () => {
    render(<TabToolbar {...makeProps({ audioBlocked: true })} />);
    expect(screen.getByText(/tap play/i)).toBeInTheDocument();
  });
});
