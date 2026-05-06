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
    onSetTempoFactor: vi.fn(),
    onSetLooping: vi.fn(),
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

  it("tempo dropdown calls onSetTempoFactor with the chosen factor", async () => {
    const onSetTempoFactor = vi.fn();
    render(<TabToolbar {...makeProps({ onSetTempoFactor })} />);
    const select = screen.getByLabelText(/tempo/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, "0.75");
    expect(onSetTempoFactor).toHaveBeenLastCalledWith(0.75);
  });

  it("loop checkbox toggles onSetLooping with the boolean state", async () => {
    const onSetLooping = vi.fn();
    render(<TabToolbar {...makeProps({ onSetLooping })} />);
    const checkbox = screen.getByRole("checkbox", { name: /loop/i });
    await userEvent.click(checkbox);
    expect(onSetLooping).toHaveBeenLastCalledWith(true);
    await userEvent.click(checkbox);
    expect(onSetLooping).toHaveBeenLastCalledWith(false);
  });

  it("renders the audio-blocked hint when audioBlocked is true", () => {
    render(<TabToolbar {...makeProps({ audioBlocked: true })} />);
    expect(screen.getByText(/tap play/i)).toBeInTheDocument();
  });
});
