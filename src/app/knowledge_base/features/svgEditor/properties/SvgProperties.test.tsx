import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { ShellErrorProvider } from "../../../shell/ShellErrorContext";
import { SvgProperties } from "./SvgProperties";
import type { SvgRefsPayload, SvgRefsRepository } from "../../../domain/svgRefs";

function stubSvgRefs() {
  const store = new Map<string, SvgRefsPayload>();
  const repo: SvgRefsRepository = {
    async read(p) { return store.get(p) ?? null; },
    async write(p, payload) {
      const sources = payload.sources ?? [];
      const attached = payload.attachedTo ?? [];
      if (sources.length === 0 && attached.length === 0) {
        store.delete(p);
        return;
      }
      store.set(p, { ...payload });
    },
  };
  return { repo, store };
}

function renderProps({
  filePath,
  collapsed = false,
  readOnly = false,
  repo,
}: {
  filePath: string | null;
  collapsed?: boolean;
  readOnly?: boolean;
  repo: SvgRefsRepository;
}) {
  return render(
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, svgRefs: repo,
        tab: null, tabRefs: null, vaultConfig: null,
      }}>
        <SvgProperties
          filePath={filePath}
          collapsed={collapsed}
          onToggleCollapse={() => {}}
          readOnly={readOnly}
        />
      </StubRepositoryProvider>
    </ShellErrorProvider>,
  );
}

describe("SvgProperties", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("renders the SourcesSection when expanded with a file", async () => {
    const { repo } = stubSvgRefs();
    renderProps({ filePath: "a.svg", repo });
    expect(await screen.findByText(/no sources recorded/i)).toBeInTheDocument();
  });

  it("hides edit affordances when readOnly", async () => {
    const { repo } = stubSvgRefs();
    renderProps({ filePath: "a.svg", repo, readOnly: true });
    expect(await screen.findByText(/no sources recorded/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sources-add")).toBeNull();
  });

  it("shows the Add button when not readOnly", async () => {
    const { repo } = stubSvgRefs();
    renderProps({ filePath: "a.svg", repo });
    expect(await screen.findByTestId("sources-add")).toBeInTheDocument();
  });

  it("collapsed root has the collapsed marker and no body content", () => {
    const { repo } = stubSvgRefs();
    renderProps({ filePath: "a.svg", collapsed: true, repo });
    const aside = screen.getByTestId("svg-properties");
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(screen.queryByText(/no sources recorded/i)).toBeNull();
  });

  it("renders aside with no body when filePath is null", () => {
    const { repo } = stubSvgRefs();
    renderProps({ filePath: null, repo });
    expect(screen.getByTestId("svg-properties")).toBeInTheDocument();
  });
});
