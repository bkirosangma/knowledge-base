"use client";

import { useMemo } from "react";
import { useRegisterCommands } from "../../shared/context/CommandRegistry";
import {
  getClaudeSurface,
} from "../../infrastructure/settingsStore";
import { useSurface } from "../claude/SurfaceContext";

export function RegisterSurfaceCommand() {
  const { setSurface } = useSurface();

  const commands = useMemo(
    () => [
      {
        id: "claude.toggleSurface",
        title: "Toggle Claude surface (Terminal ↔ Chat)",
        group: "Claude",
        run: async () => {
          const current = await getClaudeSurface();
          await setSurface(current === "terminal" ? "chat" : "terminal");
        },
      },
    ],
    [setSurface],
  );

  useRegisterCommands(commands);
  return null;
}
