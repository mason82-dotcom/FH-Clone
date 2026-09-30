import { createHash } from "node:crypto";

import type { DjiGatewayTopology } from "@fh-clone/adapter-dji-cloud";

export const DJI_PILOT_EVIDENCE_MODULES = [
  "thing",
  "liveshare",
  "api",
  "ws",
  "map",
  "tsa",
  "media",
  "mission"
] as const;

type DjiPilotEvidenceModule = (typeof DJI_PILOT_EVIDENCE_MODULES)[number];

export interface Pilot2EvidenceCapture {
  bridgePresent: true;
  platformIsVerified: true;
  version: {
    modelVersion?: string;
    appVersion?: string;
  };
  remoteControllerSn: string;
  aircraftSn: string;
  modules: Record<DjiPilotEvidenceModule, boolean>;
  thingConnected?: boolean;
  wsConnected?: boolean;
}

export interface Pilot2JsbridgeEvidence {
  schema: "fh2.pilot2-jsbridge.v1";
  realHardware: true;
  synthetic: false;
  redacted: true;
  capturedAt: string;
  bridgePresent: true;
  platformIsVerified: true;
  platformVersion: string;
  remoteControllerSnSha256: string;
  aircraftSnSha256: string;
  topologyPairMatch: true;
  moduleInventoryCaptured: true;
  modules: Record<DjiPilotEvidenceModule, boolean>;
  thingConnected?: boolean;
  wsConnected?: boolean;
  topology: {
    gateway: {
      domain?: string | number;
      type: number;
      subType: number;
      thingVersion?: string;
    };
    aircraft: {
      domain?: string | number;
      type: number;
      subType: number;
      thingVersion?: string;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readVersion(value: unknown): Pilot2EvidenceCapture["version"] | undefined {
  if (!isRecord(value)) return undefined;
  const modelVersion = boundedString(value.modelVersion, 128);
  const appVersion = boundedString(value.appVersion, 128);
  if (!modelVersion && !appVersion) return undefined;
  return {
    ...(modelVersion ? { modelVersion } : {}),
    ...(appVersion ? { appVersion } : {})
  };
}

function readModules(
  value: unknown
): Record<DjiPilotEvidenceModule, boolean> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = DJI_PILOT_EVIDENCE_MODULES.map((name) => [
    name,
    value[name]
  ] as const);
  if (entries.some(([, state]) => typeof state !== "boolean")) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<
    DjiPilotEvidenceModule,
    boolean
  >;
}

export function parsePilot2EvidenceCapture(
  value: unknown
): Pilot2EvidenceCapture | undefined {
  if (!isRecord(value)) return undefined;
  if (value.bridgePresent !== true || value.platformIsVerified !== true) {
    return undefined;
  }

  const version = readVersion(value.version);
  const remoteControllerSn = boundedString(value.remoteControllerSn, 256);
  const aircraftSn = boundedString(value.aircraftSn, 256);
  const modules = readModules(value.modules);
  if (!version || !remoteControllerSn || !aircraftSn || !modules) {
    return undefined;
  }

  const thingConnected =
    typeof value.thingConnected === "boolean"
      ? value.thingConnected
      : undefined;
  const wsConnected =
    typeof value.wsConnected === "boolean"
      ? value.wsConnected
      : undefined;

  return {
    bridgePresent: true,
    platformIsVerified: true,
    version,
    remoteControllerSn,
    aircraftSn,
    modules,
    ...(thingConnected !== undefined ? { thingConnected } : {}),
    ...(wsConnected !== undefined ? { wsConnected } : {})
  };
}

function platformVersion(
  version: Pilot2EvidenceCapture["version"]
): string {
  const parts = [
    version.appVersion ? `app=${version.appVersion}` : undefined,
    version.modelVersion ? `model=${version.modelVersion}` : undefined
  ].filter(Boolean);
  return parts.join("; ");
}

function product(
  value: DjiGatewayTopology["product"]
): Pilot2JsbridgeEvidence["topology"]["gateway"] {
  return {
    ...(value.domain !== undefined ? { domain: value.domain } : {}),
    type: value.type,
    subType: value.subType,
    ...(value.thingVersion ? { thingVersion: value.thingVersion } : {})
  };
}

export function createPilot2JsbridgeEvidence(
  capture: Pilot2EvidenceCapture,
  topology: readonly DjiGatewayTopology[],
  capturedAt = new Date().toISOString()
): Pilot2JsbridgeEvidence {
  const gateway = topology.find(
    (candidate) => candidate.gatewaySn === capture.remoteControllerSn
  );
  const aircraft = gateway?.subDevices.find(
    (candidate) => candidate.sn === capture.aircraftSn
  );

  if (!gateway || !aircraft) {
    throw new Error("pilot2_topology_pair_mismatch");
  }

  return {
    schema: "fh2.pilot2-jsbridge.v1",
    realHardware: true,
    synthetic: false,
    redacted: true,
    capturedAt,
    bridgePresent: true,
    platformIsVerified: true,
    platformVersion: platformVersion(capture.version),
    remoteControllerSnSha256: sha256(capture.remoteControllerSn),
    aircraftSnSha256: sha256(capture.aircraftSn),
    topologyPairMatch: true,
    moduleInventoryCaptured: true,
    modules: capture.modules,
    ...(capture.thingConnected !== undefined
      ? { thingConnected: capture.thingConnected }
      : {}),
    ...(capture.wsConnected !== undefined
      ? { wsConnected: capture.wsConnected }
      : {}),
    topology: {
      gateway: product(gateway.product),
      aircraft: product(aircraft.product)
    }
  };
}

export class Pilot2EvidenceStore {
  private latestEvidence: Pilot2JsbridgeEvidence | undefined;

  capture(
    capture: Pilot2EvidenceCapture,
    topology: readonly DjiGatewayTopology[],
    capturedAt?: string
  ): Pilot2JsbridgeEvidence {
    const evidence = createPilot2JsbridgeEvidence(
      capture,
      topology,
      capturedAt
    );
    this.latestEvidence = evidence;
    return evidence;
  }

  latest(): Pilot2JsbridgeEvidence | undefined {
    return this.latestEvidence
      ? structuredClone(this.latestEvidence)
      : undefined;
  }
}
