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
  type DjiPilotIdentity,
  type DjiPilotVersion
} from "./client.js";
import {
  readDjiPilotBridgeConfig,
  validateDjiPilotBridgeConfig,
  type DjiPilotBridgeConfig
} from "./config.js";

export type DjiPilotBridgeState =
  | "disabled"
  | "unavailable"
  | "initializing"
  | "ready"
  | "error";

export interface DjiPilotBridgeContextValue {
  config: DjiPilotBridgeConfig;
  state: DjiPilotBridgeState;
  error: string | null;
  verified: boolean;
  version?: DjiPilotVersion;
  identity: DjiPilotIdentity;
  client: DjiPilotBridgeClient;
}

const DjiPilotBridgeContext =
  createContext<DjiPilotBridgeContextValue | undefined>(undefined);

let initialization:
  | Promise<{
      verified: boolean;
      version?: DjiPilotVersion;
      identity: DjiPilotIdentity;
    }>
  | undefined;
let initializationKey = "";

function configKey(config: DjiPilotBridgeConfig): string {
  return JSON.stringify([
    config.verifyLicense,
    config.appId,
    config.appKey,
    config.license,
    config.workspaceId,
    config.platformName,
    config.workspaceName,
    config.workspaceDescription
  ]);
}

async function initialize(
  client: DjiPilotBridgeClient,
  config: DjiPilotBridgeConfig
) {
  const key = configKey(config);
  if (initialization && initializationKey === key) return initialization;

  initializationKey = key;
  initialization = Promise.resolve().then(() => {
    let verified = client.isVerified();

    if (!verified && config.verifyLicense) {
      client.verifyLicense(config.appId, config.appKey, config.license);
      verified = client.isVerified();
    }

    if (!verified) {
      throw new Error(
        "DJI Pilot 2 JSBridge ist nicht verifiziert; License-Prüfung bleibt fail-closed"
      );
    }

    const version = client.getVersion();
    const identity = client.getIdentity();

    return {
      verified,
      ...(version ? { version } : {}),
      identity
    };
  });

  return initialization;
}

export function DjiPilotBridgeProvider({
  children
}: {
  children: ReactNode;
}) {
  const config = useMemo(() => readDjiPilotBridgeConfig(), []);
  const client = useMemo(() => new DjiPilotBridgeClient(), []);
  const [state, setState] = useState<DjiPilotBridgeState>(
    config.enabled ? "initializing" : "disabled"
  );
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [version, setVersion] = useState<DjiPilotVersion | undefined>();
  const [identity, setIdentity] = useState<DjiPilotIdentity>({});

  useEffect(() => {
    if (!config.enabled) {
      setState("disabled");
      return;
    }

    if (!client.isAvailable()) {
      setState("unavailable");
      return;
    }

    const invalid = validateDjiPilotBridgeConfig(config);
    if (invalid.length > 0) {
      setError(`Ungültige DJI-JSBridge-Konfiguration: ${invalid.join(", ")}`);
      setState("error");
      return;
    }

    let cancelled = false;
    setState("initializing");

    void initialize(client, config)
      .then((result) => {
        if (cancelled) return;
        setVerified(result.verified);
        setVersion(result.version);
        setIdentity(result.identity);
        setError(null);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [client, config]);

  const value = useMemo<DjiPilotBridgeContextValue>(
    () => ({
      config,
      state,
      error,
      verified,
      ...(version ? { version } : {}),
      identity,
      client
    }),
    [client, config, error, identity, state, verified, version]
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
      "useDjiPilotBridge muss innerhalb von DjiPilotBridgeProvider verwendet werden"
    );
  }
  return value;
}
