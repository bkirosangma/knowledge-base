import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DrawerResizeHandle } from "./DrawerResizeHandle";

describe("DrawerResizeHandle", () => {
  it("invokes onResize on drag", () => {
    const onResize = vi.fn();
    const { getByRole } = render(<DrawerResizeHandle onResize={onResize} initialHeight={300} />);
    const handle = getByRole("separator");
    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 400 });
    expect(onResize).toHaveBeenCalledWith(400); // 300 + (500 - 400) = 400
    fireEvent.mouseUp(window);
  });
});
