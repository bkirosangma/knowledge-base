import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkillInstallToast } from "./SkillInstallToast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SkillInstallToast", () => {
  it("SKILLS-13.1-05: renders message when show=true", () => {
    render(<SkillInstallToast show />);
    expect(screen.getByRole("status")).toHaveTextContent("knowledge-base skill installed.");
  });

  it("SKILLS-13.1-06: auto-dismisses after 3 seconds", () => {
    render(<SkillInstallToast show />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("SKILLS-13.1-07: does not render when show=false", () => {
    render(<SkillInstallToast show={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("SKILLS-13.1-08: error tone renders role=alert with red styling", () => {
    render(<SkillInstallToast show tone="error" message="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("SKILLS-13.1-09: error tone still auto-dismisses after 3 s", () => {
    render(<SkillInstallToast show tone="error" message="boom" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
