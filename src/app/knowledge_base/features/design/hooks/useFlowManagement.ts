import { useCallback, type MutableRefObject } from "react";
import type { Connection, FlowDef, Selection } from "../../../shared/utils/types";
import { isContiguous, orderConnections } from "../utils/flowUtils";

export function useFlowManagement(
  connectionsRef: MutableRefObject<Connection[]>,
  flowsRef: MutableRefObject<FlowDef[]>,
  flowCounter: MutableRefObject<number>,
  setFlows: React.Dispatch<React.SetStateAction<FlowDef[]>>,
  setSelection: React.Dispatch<React.SetStateAction<Selection>>,
  scheduleRecord: (description: string) => void,
) {
  const handleCreateFlow = useCallback((connectionIds: string[]) => {
    if (!isContiguous(connectionIds, connectionsRef.current)) {
      return;
    }
    const ordered = orderConnections(connectionIds, connectionsRef.current);
    const id = `flow-${++flowCounter.current}`;
    const existingNames = flowsRef.current.map((f) => f.name);
    let n = flowsRef.current.length + 1;
    let name = `Flow ${n}`;
    while (existingNames.includes(name)) { n++; name = `Flow ${n}`; }
    const newFlow: FlowDef = { id, name, connectionIds: ordered };
    setFlows((prev) => [...prev, newFlow]);
    setSelection({ type: 'flow', id });
    scheduleRecord("Create flow");
  }, [scheduleRecord]);

  const handleSelectFlow = useCallback((flowId: string) => {
    setSelection({ type: 'flow', id: flowId });
  }, []);

  const handleUpdateFlow = useCallback((oldId: string, updates: Partial<{ id: string; name: string; category: string }>) => {
    const newId = updates.id;
    setFlows((prev) => prev.map((f) => f.id === oldId ? { ...f, ...updates } : f));
    if (newId && newId !== oldId) {
      setSelection({ type: 'flow', id: newId });
    }
    scheduleRecord("Edit flow");
  }, [scheduleRecord]);

  const handleDeleteFlow = useCallback((flowId: string) => {
    setFlows((prev) => prev.filter((f) => f.id !== flowId));
    setSelection(null);
    scheduleRecord("Delete flow");
  }, [scheduleRecord]);

  const handleSelectLine = useCallback((lineId: string) => {
    setSelection({ type: 'line', id: lineId });
  }, []);

  return { handleCreateFlow, handleSelectFlow, handleUpdateFlow, handleDeleteFlow, handleSelectLine };
}
