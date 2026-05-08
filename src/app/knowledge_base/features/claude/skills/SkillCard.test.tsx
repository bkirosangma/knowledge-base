import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// VaultFilePickerModal imports tauriBridge at module load time; mock it so
// vitest doesn't try to invoke Tauri's invoke() during render.
vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    list: vi.fn(() => Promise.resolve([])),
  },
}));

import { SkillCard } from "./SkillCard";
import { SLASH_COMMANDS } from "../slash/slashCommands";

const find = (id: string) => SLASH_COMMANDS.find((c) => c.id === id)!;

describe("SkillCard", () => {
  it("SKILLS-13.3-07: validate card runs without an argument", () => {
    const onRun = vi.fn();
    render(<SkillCard command={find("validate")} onRun={onRun} />);
    fireEvent.submit(screen.getByTestId("skill-card-validate"));
    expect(onRun).toHaveBeenCalledWith("/kb validate");
  });

  it("SKILLS-13.3-08: argument-style card disables Run when input empty", () => {
    render(<SkillCard command={find("document")} onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("SKILLS-13.3-09: argument-style card submits formatted text", () => {
    const onRun = vi.fn();
    render(<SkillCard command={find("document")} onRun={onRun} />);
    fireEvent.change(screen.getByLabelText("/kb document argument"), {
      target: { value: "raga theory" },
    });
    fireEvent.submit(screen.getByTestId("skill-card-document"));
    expect(onRun).toHaveBeenCalledWith("/kb document raga theory");
  });

  it("SKILLS-13.3-10: edit / transform cards show 'Pick a file…' picker trigger", () => {
    render(<SkillCard command={find("edit")} onRun={vi.fn()} />);
    expect(screen.getByTestId("skill-card-edit-picker-trigger")).toHaveTextContent("Pick a file…");
  });

  it("SKILLS-13.3-11: edit card disables Run until a file is picked", () => {
    render(<SkillCard command={find("edit")} onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});
