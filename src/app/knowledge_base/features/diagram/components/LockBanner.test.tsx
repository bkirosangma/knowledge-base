import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LockBanner } from "./LockBanner";

describe("LockBanner", () => {
  it("renders the flow name and an Unlock button", () => {
    render(<LockBanner flowName="Auth" onUnlock={() => {}} />);
    expect(screen.getByTestId("lock-banner")).toHaveTextContent("Auth");
    expect(screen.getByTestId("lock-banner-unlock")).toHaveTextContent("Unlock");
  });

  it("calls onUnlock when the button is clicked", () => {
    const onUnlock = vi.fn();
    render(<LockBanner flowName="Auth" onUnlock={onUnlock} />);
    fireEvent.click(screen.getByTestId("lock-banner-unlock"));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
