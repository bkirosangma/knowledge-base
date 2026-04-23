import { describe, it, expect, vi, beforeEach } from 'vitest';
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
