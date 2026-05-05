import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from "@testing-library/react";
import { FlowProperties } from "./FlowProperties";
import type { FlowDef, Connection, NodeData } from "../types";

const flow: FlowDef = { id: "flow-1", name: "Auth Flow", connectionIds: [] };
const baseProps = {
  id: "flow-1",
  flows: [flow],
  connections: [] as Connection[],
  nodes: [] as NodeData[],
  allFlowIds: ["flow-1"],
  attachedDocs: [],
  onAttach: vi.fn(),
  onDetach: vi.fn(),
  onPreview: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

it("renders a Documents section", () => {
  render(<FlowProperties {...baseProps} />);
  expect(screen.getByText("Documents")).toBeInTheDocument();
});

it("shows 'No documents attached' when attachedDocs is empty", () => {
  render(<FlowProperties {...baseProps} />);
  expect(screen.getByText(/no documents linked to this flow/i)).toBeInTheDocument();
});

it("renders attached doc filename", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} />);
  expect(screen.getByText("auth.md")).toBeInTheDocument();
});

it("calls onPreview when a doc filename is clicked", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} />);
  fireEvent.click(screen.getByText("auth.md"));
  expect(baseProps.onPreview).toHaveBeenCalledWith("docs/auth.md");
});

it("calls onAttach when 'Attach existing' is clicked", () => {
  render(<FlowProperties {...baseProps} />);
  fireEvent.click(screen.getByText(/attach existing/i));
  expect(baseProps.onAttach).toHaveBeenCalledTimes(1);
});

it("hides attach/detach controls in readOnly mode", () => {
  render(<FlowProperties {...baseProps} readOnly />);
  expect(screen.queryByText(/attach/i)).not.toBeInTheDocument();
});

it("opens DetachDocModal when detach button is clicked", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} getDocumentReferences={vi.fn().mockReturnValue({ attachments: [], wikiBacklinks: [] })} deleteDocumentWithCleanup={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/detach docs\/auth\.md/i));
  expect(screen.getByRole("dialog")).toBeInTheDocument(); // DetachDocModal rendered
});

// ---------------------------------------------------------------------------
// Member nodes section
// ---------------------------------------------------------------------------

import { describe } from "vitest";

const NODES: NodeData[] = [
  { id: "a", label: "A", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "b", label: "B", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "c", label: "C", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
];
const CONNS: Connection[] = [
  { id: "c1", from: "a", to: "b", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
  { id: "c2", from: "b", to: "c", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
];

function renderProps(flow: FlowDef, onUpdate = vi.fn()) {
  render(
    <FlowProperties
      id="f"
      flows={[flow]}
      connections={CONNS}
      nodes={NODES}
      allFlowIds={["f"]}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate };
}

describe("FlowProperties — Member nodes section", () => {
  it("lists every flow-member node sorted by order then label", () => {
    renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"], nodeOrders: { c: 1, a: 2 } });
    const rows = screen.getAllByTestId(/^flow-member-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "flow-member-row-c", // order 1
      "flow-member-row-a", // order 2
      "flow-member-row-b", // unset → after numbered, alphabetical
    ]);
  });

  it("calls onUpdate with new nodeOrders when the input commits", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const input = screen.getByTestId("flow-member-order-input-a") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ nodeOrders: { a: 5 } }));
  });

  it("toggles startNodeIds when the start checkbox changes", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const cb = screen.getByTestId("flow-member-start-checkbox-a") as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ startNodeIds: ["a"] }));
  });

  it("toggles endNodeIds when the end checkbox changes", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const cb = screen.getByTestId("flow-member-end-checkbox-c") as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ endNodeIds: ["c"] }));
  });

  it("Number sequentially button stamps 1..n by current sort", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    fireEvent.click(screen.getByTestId("flow-number-sequentially"));
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({
      nodeOrders: { a: 1, b: 2, c: 3 },
    }));
  });
});

// ---------------------------------------------------------------------------
// Lock into Flow button
// ---------------------------------------------------------------------------

it("calls onLock when Lock into Flow button is clicked", () => {
  const onLock = vi.fn();
  render(
    <FlowProperties
      id="f"
      flows={[{ id: "f", name: "F", connectionIds: [] }]}
      connections={[]}
      nodes={[]}
      allFlowIds={["f"]}
      onLock={onLock}
    />,
  );
  fireEvent.click(screen.getByTestId("flow-lock-button"));
  expect(onLock).toHaveBeenCalledWith("f");
});
