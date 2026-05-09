"use client";

import { useMemo } from "react";
import { useRegisterCommands } from "../../shared/context/CommandRegistry";
import {
  getClaudeSurface,
  setClaudeSurface,
  type ClaudeSurface,
} from "../../infrastructure/settingsStore";

interface Props {
  /** Notifies parent when the surface flips so it re-reads the setting. */
  onSurfaceChange?: (next: ClaudeSurface) => void;
}

export function RegisterSurfaceCommand({ onSurfaceChange }: Props) {
  const commands = useMemo(
    () => [
      {
        id: "claude.toggleSurface",
        title: "Toggle Claude surface (Terminal ↔ Chat)",
        group: "Claude",
        run: async () => {
          const current = await getClaudeSurface();
          const next: ClaudeSurface = current === "terminal" ? "chat" : "terminal";
          await setClaudeSurface(next);
          onSurfaceChange?.(next);
        },
      },
    ],
    [onSurfaceChange],
  );

  useRegisterCommands(commands);
  return null;
}
