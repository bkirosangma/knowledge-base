"use client";

import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { SkillInstallToast } from "./components/SkillInstallToast";
import { ClaudeChatDrawer } from "./ClaudeChatDrawer";
import { TerminalDrawer } from "../terminal/TerminalDrawer";
import { RegisterSurfaceCommand } from "../terminal/registerSurfaceCommand";
import { useSurface } from "./SurfaceContext";

interface Props {
  vaultPath: string | null;
}

export function ClaudeDrawer({ vaultPath }: Props) {
  const { surface } = useSurface();
  const skillBootstrap = useSkillBootstrap("knowledge-base");

  return (
    <>
      <RegisterSurfaceCommand />
      {skillBootstrap.justInstalled && <SkillInstallToast show />}
      {surface === "terminal" ? (
        <TerminalDrawer vaultPath={vaultPath} />
      ) : (
        <ClaudeChatDrawer />
      )}
    </>
  );
}
