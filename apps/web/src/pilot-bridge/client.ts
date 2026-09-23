export const DJI_PILOT_MODULES = [
  "thing",
  "liveshare",
  "api",
  "ws",
  "map",
  "tsa",
  "media",
  "mission"
] as const;

export type DjiPilotModuleName =
  (typeof DJI_PILOT_MODULES)[number];

export interface DjiPilotVersion {
  modelVersion?: string;
  appVersion?: string;
  [key: string]: unknown;
}

export interface DjiPilotIdentity {
  remoteControllerSn?: string;
  aircraftSn?: string;
}

export interface DjiPilotRuntimeSnapshot {
  verified: boolean;
  version?: DjiPilotVersion;
  identity: DjiPilotIdentity;
  modules: Record<DjiPilotModuleName, boolean>;
  thingConnected?: boolean;
  wsConnected?: boolean;
}

interface DjiBridgeEnvelope {
  code: number;
  message?: string;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function decodeRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function unwrap(raw: unknown, operation: string): unknown {
  const decoded = decodeRaw(raw);

  if (!isRecord(decoded) || typeof decoded.code !== "number") {
    return decoded;
  }

  const envelope = decoded as unknown as DjiBridgeEnvelope;
  if (envelope.code !== 0) {
    throw new Error(
      `DJI JSBridge ${operation} fehlgeschlagen (${envelope.code}): ` +
        (envelope.message ?? "ohne Fehlermeldung")
    );
  }

  return envelope.data;
}

function asBoolean(value: unknown): boolean {
  const decoded = decodeRaw(value);
  if (typeof decoded === "boolean") return decoded;
  if (typeof decoded === "number") return decoded !== 0;
  if (typeof decoded === "string") {
    return decoded.trim().toLowerCase() === "true";
  }
  if (isRecord(decoded) && typeof decoded.data === "boolean") {
    return decoded.data;
  }
  return false;
}

function asString(value: unknown): string | undefined {
  const decoded = decodeRaw(value);
  if (typeof decoded === "string") {
    const trimmed = decoded.trim();
    return trimmed || undefined;
  }
  if (isRecord(decoded) && typeof decoded.data === "string") {
    const trimmed = decoded.data.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function runtime(): NonNullable<Window["djiBridge"]> {
  const bridge = window.djiBridge;
  if (!bridge) {
    throw new Error(
      "DJI Pilot 2 JSBridge ist in diesem WebView nicht verfügbar"
    );
  }
  return bridge;
}

/**
 * Read-only wrapper for the official DJI Pilot 2 window.djiBridge runtime.
 *
 * Deliberately excluded from this surface:
 * - platformVerifyLicense
 * - platformLoadComponent / platformUnloadComponent
 * - API token access
 * - thing/ws connect or send operations
 * - workspace mutation
 * - media/livestream mutation
 *
 * Those operations require a separate authenticated bootstrap and explicit
 * FH2 safety review. Identity and module observations never grant control.
 */
export class DjiPilotBridgeClient {
  isAvailable(): boolean {
    return Boolean(window.djiBridge);
  }

  isVerified(): boolean {
    return asBoolean(
      unwrap(runtime().platformIsVerified(), "platformIsVerified")
    );
  }

  getVersion(): DjiPilotVersion | undefined {
    const value = unwrap(
      runtime().platformGetVersion(),
      "platformGetVersion"
    );
    return isRecord(value)
      ? (value as DjiPilotVersion)
      : undefined;
  }

  getIdentity(): DjiPilotIdentity {
    const bridge = runtime();
    const remoteControllerSn = asString(
      unwrap(
        bridge.platformGetRemoteControllerSN(),
        "platformGetRemoteControllerSN"
      )
    );
    const aircraftSn = asString(
      unwrap(
        bridge.platformGetAircraftSN(),
        "platformGetAircraftSN"
      )
    );

    return {
      ...(remoteControllerSn ? { remoteControllerSn } : {}),
      ...(aircraftSn ? { aircraftSn } : {})
    };
  }

  isComponentLoaded(name: DjiPilotModuleName): boolean {
    return asBoolean(
      unwrap(
        runtime().platformIsComponentLoaded(name),
        `platformIsComponentLoaded(${name})`
      )
    );
  }

  getThingConnectState(): boolean {
    return asBoolean(
      unwrap(
        runtime().thingGetConnectState(),
        "thingGetConnectState"
      )
    );
  }

  getWsConnectState(): boolean {
    return asBoolean(
      unwrap(runtime().wsGetConnectState(), "wsGetConnectState")
    );
  }

  readSnapshot(): DjiPilotRuntimeSnapshot {
    const verified = this.isVerified();
    if (!verified) {
      return {
        verified: false,
        identity: {},
        modules: emptyModuleState()
      };
    }

    const modules = Object.fromEntries(
      DJI_PILOT_MODULES.map((name) => [
        name,
        this.isComponentLoaded(name)
      ])
    ) as Record<DjiPilotModuleName, boolean>;

    return {
      verified: true,
      ...(this.getVersion()
        ? { version: this.getVersion() }
        : {}),
      identity: this.getIdentity(),
      modules,
      ...(modules.thing
        ? { thingConnected: this.getThingConnectState() }
        : {}),
      ...(modules.ws
        ? { wsConnected: this.getWsConnectState() }
        : {})
    };
  }
}

export function emptyModuleState(): Record<
  DjiPilotModuleName,
  boolean
> {
  return Object.fromEntries(
    DJI_PILOT_MODULES.map((name) => [name, false])
  ) as Record<DjiPilotModuleName, boolean>;
}
