"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Command {
  id: string;
  title: string;
  group: string;
  shortcut?: string;
  /** Runtime guard — command only appears when this returns true (or is undefined). */
  when?: () => boolean;
  run: () => void;
}

interface CommandRegistryContextValue {
  /** Internal — used by useRegisterCommands. */
  _register: (commands: Command[]) => void;
  _unregister: (ids: string[]) => void;
  /** Public — used by CommandPalette and consumers. */
  commands: Command[];
  open: boolean;
  setOpen: (v: boolean) => void;
  query: string;
  setQuery: (v: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const CommandRegistryContext = createContext<CommandRegistryContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CommandRegistryProvider({ children }: { children: React.ReactNode }) {
  // Keyed map stored in a ref so registration doesn't cause re-renders.
  const mapRef = useRef<Map<string, Command>>(new Map());
  // Version counter triggers a re-derive of the `commands` array.
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const _register = useCallback((commands: Command[]) => {
    for (const cmd of commands) {
      mapRef.current.set(cmd.id, cmd);
    }
    setVersion((v) => v + 1);
  }, []);

  const _unregister = useCallback((ids: string[]) => {
    for (const id of ids) {
      mapRef.current.delete(id);
    }
    setVersion((v) => v + 1);
  }, []);

  // Derive the stable array only when version changes.
  const commands = useMemo(
    () => Array.from(mapRef.current.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const value = useMemo<CommandRegistryContextValue>(
    () => ({ _register, _unregister, commands, open, setOpen, query, setQuery }),
    [_register, _unregister, commands, open, query],
  );

  return (
    <CommandRegistryContext.Provider value={value}>
      {children}
    </CommandRegistryContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Register a stable set of commands while the calling component is mounted.
 * Pass a memoized array (useMemo) to avoid re-registering every render.
 * No-ops gracefully when used outside CommandRegistryProvider (e.g. in unit tests).
 */
export function useRegisterCommands(commands: Command[]) {
  const ctx = useContext(CommandRegistryContext);

  // Use a ref so the cleanup always sees the current set of ids, even if
  // `commands` identity changes between render and unmount.
  const idsRef = useRef<string[]>([]);
  // Stable no-op refs for when the context is absent.
  const noopRegister = useCallback((_cmds: Command[]) => {}, []);
  const noopUnregister = useCallback((_ids: string[]) => {}, []);

  const _register = ctx?._register ?? noopRegister;
  const _unregister = ctx?._unregister ?? noopUnregister;

  useEffect(() => {
    const ids = commands.map((c) => c.id);
    idsRef.current = ids;
    _register(commands);
    return () => {
      _unregister(idsRef.current);
    };
    // Re-run only when command identity or registration fns change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, _register, _unregister]);
}

// Stable no-op fallback used when the context is absent (e.g. unit tests).
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
const FALLBACK_REGISTRY = {
  commands: [] as Command[],
  open: false,
  setOpen: noop as (v: boolean) => void,
  query: "",
  setQuery: noop as (v: string) => void,
};

/**
 * Access palette state and the live list of currently registered commands.
 * Falls back to a no-op stub when used outside CommandRegistryProvider (e.g. unit tests).
 */
export function useCommandRegistry() {
  const ctx = useContext(CommandRegistryContext);
  if (!ctx) return FALLBACK_REGISTRY;
  const { commands, open, setOpen, query, setQuery } = ctx;
  return { commands, open, setOpen, query, setQuery };
}
