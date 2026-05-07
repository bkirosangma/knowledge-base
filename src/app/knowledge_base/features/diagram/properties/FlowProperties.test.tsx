import { it, expect, vi, beforeEach, describe } from 'vitest';
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FlowProperties } from "./FlowProperties";
import type { FlowDef, Connection, NodeData } from "../types";
import type { SourceLink } from "../../../shared/types/sources";
import type { AttachmentBuckets } from "../../document/types";

const EMPTY_BUCKETS: AttachmentBuckets = { docs: [], diagrams: [], svgs: [], tabs: [] };

beforeEach(() => vi.clearAllMocks());

// The pre-MVP-2b "Documents" section — bespoke list + DetachDocModal +
// "Create & attach new…" button — was retired in favour of the unified
// `<AttachmentsSection>`. The cascade-detach (DetachDocModal) flow now lives
// inside `AttachmentsSection.test.tsx`; FlowProperties only provides the
// `entityScope` + `getDocumentReferences` + `deleteDocumentWithCleanup` wiring
// and a "Create & attach new…" affordance gated on `onCreateAndAttach`.

it("FlowProperties renders the unified AttachmentsSection when attachmentsByType is provided", () => {
  const attachmentsByType = vi.fn().mockReturnValue(EMPTY_BUCKETS);
  render(
    <FlowProperties
      id="flow-1"
      flows={[{ id: "flow-1", name: "Auth Flow", connectionIds: [] }]}
      connections={[]}
      nodes={[]}
      allFlowIds={["flow-1"]}
      attachmentsByType={attachmentsByType}
    />,
  );
  expect(attachmentsByType).toHaveBeenCalledWith({ type: "flow", id: "flow-1" });
});

it("FlowProperties exposes a 'Create & attach new…' button when onCreateAndAttach is wired", () => {
  const onCreateAndAttach = vi.fn();
  render(
    <FlowProperties
      id="flow-1"
      flows={[{ id: "flow-1", name: "Auth Flow", connectionIds: [] }]}
      connections={[]}
      nodes={[]}
      allFlowIds={["flow-1"]}
      attachmentsByType={() => EMPTY_BUCKETS}
      onCreateAndAttach={onCreateAndAttach}
    />,
  );
  expect(screen.getByText(/create & attach new/i)).toBeInTheDocument();
});

it("FlowProperties hides 'Create & attach new…' when readOnly", () => {
  render(
    <FlowProperties
      id="flow-1"
      flows={[{ id: "flow-1", name: "Auth Flow", connectionIds: [] }]}
      connections={[]}
      nodes={[]}
      allFlowIds={["flow-1"]}
      attachmentsByType={() => EMPTY_BUCKETS}
      onCreateAndAttach={vi.fn()}
      readOnly
    />,
  );
  expect(screen.queryByText(/create & attach new/i)).not.toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Member nodes section
// ---------------------------------------------------------------------------

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

// ─── Sources section ────────────────────────────────────────────────────────

describe("FlowProperties — Sources section", () => {
  it("renders an existing source row and commits a new URL via onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    function Host() {
      const [sources, setSources] = useState<SourceLink[]>([
        { url: "https://example.com", title: "Example" },
      ]);
      const flowWithSource: FlowDef = {
        id: "flow-1",
        name: "Auth Flow",
        connectionIds: [],
        sources,
      };
      return (
        <FlowProperties
          id="flow-1"
          flows={[flowWithSource]}
          connections={[]}
          nodes={[]}
          allFlowIds={["flow-1"]}
          onUpdate={(id, updates) => {
            onUpdate(id, updates);
            if (updates.sources !== undefined) setSources(updates.sources);
          }}
        />
      );
    }
    render(<Host />);
    expect(screen.getByTestId("sources-row-0")).toBeInTheDocument();

    await user.click(screen.getByTestId("sources-add"));
    const urlInput = await screen.findByTestId("sources-url-input-1");
    await user.type(urlInput, "https://docs.example.org");
    await user.tab();

    const lastCall = onUpdate.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("flow-1");
    expect(lastCall?.[1]).toEqual({
      sources: [
        { url: "https://example.com", title: "Example" },
        { url: "https://docs.example.org", title: "" },
      ],
    });
  });
});
