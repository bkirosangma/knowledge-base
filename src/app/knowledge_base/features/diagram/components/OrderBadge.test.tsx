import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderBadge } from "./OrderBadge";

describe("OrderBadge", () => {
  it("renders nothing when value is undefined and editable is false", () => {
    const { container } = render(<OrderBadge value={undefined} editable={false} onChange={() => {}} nodeId="n1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the number when value is provided in read mode", () => {
    render(<OrderBadge value={3} editable={false} onChange={() => {}} nodeId="n1" />);
    expect(screen.getByTestId("order-badge-n1")).toHaveTextContent("3");
  });

  it("renders an empty editable badge when value undefined and editable", () => {
    render(<OrderBadge value={undefined} editable={true} onChange={() => {}} nodeId="n1" />);
    const badge = screen.getByTestId("order-badge-n1");
    expect(badge).toHaveTextContent("");
    expect(badge).toHaveClass("border-dashed");
  });

  it("calls onChange with the parsed integer when input commits via Enter", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={1} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("calls onChange with undefined when the input is cleared and committed", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={2} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not call onChange on Escape", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={4} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
