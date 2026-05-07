import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileLevelReferencesGroup } from "./FileLevelReferencesGroup";

const docs = [
  { filename: "a.md", title: "A Doc" },
  { filename: "b.md", title: "B Doc" },
  { filename: "c.md", title: "" },
];

describe("FileLevelReferencesGroup", () => {
  it("renders empty state when there are no rows", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText(/no references/i)).toBeInTheDocument();
    // No onAttach was provided — the attach affordance should not render.
    expect(screen.queryByTestId("file-references-attach")).toBeNull();
  });

  it("renders attachment rows", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText("A Doc")).toBeInTheDocument();
  });

  it("merges attachments and backlinks; attachment wins on duplicate", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[{ sourcePath: "a.md" }, { sourcePath: "b.md" }]}
        documents={docs}
      />,
    );
    expect(screen.getByText("A Doc")).toBeInTheDocument();
    expect(screen.getByText("B Doc")).toBeInTheDocument();
    // a.md row uses the attachment icon, not wiki-link
    const aIcon = screen.getAllByTestId("reference-row-icon-attachment");
    expect(aIcon.length).toBeGreaterThan(0);
  });

  it("falls back to filename when title is blank", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["c.md"]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText("c.md")).toBeInTheDocument();
  });

  it("invokes onPreview with the source path", () => {
    const onPreview = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
        onPreview={onPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open a doc/i }));
    expect(onPreview).toHaveBeenCalledWith("a.md");
  });

  it("invokes onDetach with the source path", () => {
    const onDetach = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
        onDetach={onDetach}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /detach a doc/i }));
    expect(onDetach).toHaveBeenCalledWith("a.md");
  });

  it("renders + Attach document button when onAttach is provided and not readOnly", () => {
    const onAttach = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
        onAttach={onAttach}
      />,
    );
    fireEvent.click(screen.getByTestId("file-references-attach"));
    expect(onAttach).toHaveBeenCalledOnce();
  });

  it("hides attach button when readOnly", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
        readOnly
        onAttach={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("file-references-attach")).toBeNull();
  });
});
