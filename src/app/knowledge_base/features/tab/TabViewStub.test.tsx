import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabViewStub } from "./TabViewStub";

describe("TabViewStub", () => {
  it("renders the placeholder with the file path", () => {
    render(<TabViewStub filePath="songs/intro.alphatex" />);
    expect(screen.getByTestId("tab-view-stub")).toBeInTheDocument();
    expect(screen.getByText(/songs\/intro\.alphatex/)).toBeInTheDocument();
  });

  it("renders a 'coming soon' message that names TAB-004", () => {
    render(<TabViewStub filePath="x.alphatex" />);
    expect(screen.getByText(/TAB-004/)).toBeInTheDocument();
  });
});
