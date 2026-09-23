import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  DjiPilotBridgeClient,
  emptyModuleState,
  type DjiPilotRuntimeSnapshot
} from "./client.js";

export type DjiPilotBridgeState =
  | "unavailable"
  | "unverified"
  | "ready"
  | "error";

export interface DjiPilotBridgeContextValue {
  state: DjiPilotBridgeState;
  error: string | null;
  snapshot: DjiPilotRuntimeSnapshot;
  client: DjiPilotBridgeClient;
}

const EMPTY_SNAPSHOT: DjiPilotRuntimeSnapshot = {
  verified: false,
  identity: {},
  modules: emptyModuleState()
};

const DjiPilotBridgeContext =
  createContext<DjiPilotBridgeContextValue | undefined>(
    undefined
  );

export function DjiPilotBridgeProvider({
  children
}: {
  children: ReactNode;
}) {
  const client = useMemo(
    () => new DjiPilotBridgeClient(),
    []
  );
  const [state, setState] =
    useState<DjiPilotBridgeState>("unavailable");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] =
    useState<DjiPilotRuntimeSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;

      if (!client.isAvailable()) {
        setSnapshot(EMPTY_SNAPSHOT);
        setError(null);
        setState("unavailable");
        return;
      }

      try {
        const next = client.readSnapshot();
        if (cancelled) return;

        setSnapshot(next);
        setError(null);
        setState(next.verified ? "ready" : "unverified");
      } catch (reason: unknown) {
        if (cancelled) return;
        setSnapshot(EMPTY_SNAPSHOT);
        setError(
          reason instanceof Error
            ? reason.message
            : String(reason)
        );
        setState("error");
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client]);

  const value = useMemo<DjiPilotBridgeContextValue>(
    () => ({
      state,
      error,
      snapshot,
      client
    }),
    [client, error, snapshot, state]
  );

  return (
    <DjiPilotBridgeContext.Provider value={value}>
      {children}
    </DjiPilotBridgeContext.Provider>
  );
}

export function useDjiPilotBridge(): DjiPilotBridgeContextValue {
  const value = useContext(DjiPilotBridgeContext);
  if (!value) {
    throw new Error(
      "useDjiPilotBridge muss innerhalb von " +
        "DjiPilotBridgeProvider verwendet werden"
    );
  }
  return value;
}
