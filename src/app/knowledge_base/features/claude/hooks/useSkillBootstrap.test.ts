import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock tauriBridge before importing the hook
vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    skillStatus: vi.fn(),
    skillInstallFromBundle: vi.fn(),
  },
}));

import { tauriBridge } from "../../../infrastructure/tauriBridge";
import { useSkillBootstrap, __resetSkillBootstrapForTests } from "./useSkillBootstrap";

const status = vi.mocked(tauriBridge.skillStatus);
const install = vi.mocked(tauriBridge.skillInstallFromBundle);

describe("useSkillBootstrap", () => {
  beforeEach(() => {
    __resetSkillBootstrapForTests();
    status.mockReset();
    install.mockReset();
  });

  it("SKILLS-13.1-01: skips install when target exists", async () => {
    status.mockResolvedValue({ installed: true, targetPath: "/x", bundledPath: "/y" });
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.justInstalled).toBe(false);
    expect(install).not.toHaveBeenCalled();
  });

  it("SKILLS-13.1-02: invokes install when target missing", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockResolvedValue();
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.justInstalled).toBe(true);
    expect(install).toHaveBeenCalledOnce();
  });

  it("SKILLS-13.1-03: per-session guard prevents second install", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockResolvedValue();
    renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    install.mockClear();
    renderHook(() => useSkillBootstrap("knowledge-base"));
    // No second call even though we mounted a fresh hook instance.
    expect(install).not.toHaveBeenCalled();
  });

  it("SKILLS-13.1-04: surfaces install errors", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.error).toBe("permission denied");
    expect(result.current.justInstalled).toBe(false);
  });
});
