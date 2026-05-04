import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VoiceToggle } from "./VoiceToggle";

describe("VoiceToggle", () => {
  it("renders V1 / V2 with correct aria-pressed when voice 0 is active", () => {
    const { getByRole } = render(<VoiceToggle voiceIndex={0} onChange={() => {}} />);
    expect(getByRole("button", { name: /Voice 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: /Voice 2/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders V1 / V2 with correct aria-pressed when voice 1 is active", () => {
    const { getByRole } = render(<VoiceToggle voiceIndex={1} onChange={() => {}} />);
    expect(getByRole("button", { name: /Voice 1/ })).toHaveAttribute("aria-pressed", "false");
    expect(getByRole("button", { name: /Voice 2/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking V2 fires onChange(1)", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<VoiceToggle voiceIndex={0} onChange={onChange} />);
    fireEvent.click(getByRole("button", { name: /Voice 2/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clicking V1 from V2 fires onChange(0)", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<VoiceToggle voiceIndex={1} onChange={onChange} />);
    fireEvent.click(getByRole("button", { name: /Voice 1/ }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders inside a role='group' with aria-label='Voice'", () => {
    const { getByRole } = render(<VoiceToggle voiceIndex={0} onChange={() => {}} />);
    expect(getByRole("group", { name: /Voice/ })).toBeTruthy();
  });
});
