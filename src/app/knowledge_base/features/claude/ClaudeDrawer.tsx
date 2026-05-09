"use client";

import { useEffect, useState } from "react";
import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { SkillInstallToast } from "./components/SkillInstallToast";
import { ClaudeChatDrawer } from "./ClaudeChatDrawer";
import { TerminalDrawer } from "../terminal/TerminalDrawer";
import { RegisterSurfaceCommand } from "../terminal/registerSurfaceCommand";
import { getClaudeSurface, type ClaudeSurface } from "../../infrastructure/settingsStore";

interface Props {
  vaultPath: string | null;
}

export function ClaudeDrawer({ vaultPath }: Props) {
  const [surface, setSurface] = useState<ClaudeSurface>("terminal");
  const skillBootstrap = useSkillBootstrap("knowledge-base");

  useEffect(() => {
    void getClaudeSurface().then(setSurface);
  }, []);

  return (
    <>
      <RegisterSurfaceCommand onSurfaceChange={setSurface} />
      {skillBootstrap.justInstalled && <SkillInstallToast show />}
      {surface === "terminal" ? (
        <TerminalDrawer vaultPath={vaultPath} />
      ) : (
        <ClaudeChatDrawer />
      )}
    </>
  );
}
