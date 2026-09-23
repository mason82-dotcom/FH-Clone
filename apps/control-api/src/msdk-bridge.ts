import {
  createHmac,
  timingSafeEqual
} from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._:-]{3,128}$/;

export interface MsdkBridgeSnapshot {
  schema: "fh2.msdk.v1";
  timestampMs: number;
  sdk: {
    registered: boolean;
    productConnected: boolean;
  };
  gateway: {
    connected: boolean;
    serialNumber: string;
    firmwareVersion?: string | null;
  };
  aircraft: {
    flightControllerConnected: boolean;
    productType: string;
    flightControllerSerial: string;
  };
  sensors: unknown[];
  rtk: Record<string, unknown>;
  control: {
    enabled: boolean;
    authorityOwner: string;
  };
  capabilities: Record<string, boolean>;
}

export interface MsdkAgentRecord {
  gatewaySn: string;
  aircraftSn: string;
  pairedAt: number;
  lastSeenAt: number;
  snapshot: MsdkBridgeSnapshot;
}

export interface MsdkPairingResult {
  agentToken: string;
  expiresAt: number;
  gatewaySn: string;
  aircraftSn: string;
}

interface MsdkTokenPayload {
  v: 1;
  gatewaySn: string;
  aircraftSn: string;
  exp: number;
}

export interface MsdkBridgeServiceOptions {
  pairingToken?: string;
  signingSecret?: string;
  tokenTtlMs?: number;
  now?: () => number;
}

export class MsdkBridgeService {
  private readonly pairingToken?: string;
  private readonly signingSecret?: string;
  private readonly tokenTtlMs: number;
  private readonly now: () => number;
  private readonly agents = new Map<string, MsdkAgentRecord>();

  constructor(options: MsdkBridgeServiceOptions = {}) {
    this.pairingToken = options.pairingToken;
    this.signingSecret = options.signingSecret;
    this.tokenTtlMs = options.tokenTtlMs ?? 86_400_000;
    this.now = options.now ?? Date.now;
  }

  get configured(): boolean {
    return Boolean(this.pairingToken && this.signingSecret);
  }

  pair(
    presentedPairingToken: string | undefined,
    snapshot: MsdkBridgeSnapshot
  ): MsdkPairingResult | undefined {
    if (!this.configured) return undefined;
    if (!presentedPairingToken || !this.pairingToken) return undefined;
    if (!safeEqual(presentedPairingToken, this.pairingToken)) return undefined;

    const identity = snapshotIdentity(snapshot);
    if (!identity) return undefined;

    const now = this.now();
    const expiresAt = now + this.tokenTtlMs;
    const payload: MsdkTokenPayload = {
      v: 1,
      gatewaySn: identity.gatewaySn,
      aircraftSn: identity.aircraftSn,
      exp: expiresAt
    };
    const agentToken = this.sign(payload);

    this.agents.set(agentKey(identity.gatewaySn, identity.aircraftSn), {
      gatewaySn: identity.gatewaySn,
      aircraftSn: identity.aircraftSn,
      pairedAt: now,
      lastSeenAt: now,
      snapshot
    });

    return {
      agentToken,
      expiresAt,
      gatewaySn: identity.gatewaySn,
      aircraftSn: identity.aircraftSn
    };
  }

  heartbeat(
    agentToken: string,
    snapshot: MsdkBridgeSnapshot
  ): boolean {
    const identity = snapshotIdentity(snapshot);
    if (!identity) return false;

    const token = this.verify(agentToken);
    if (!token) return false;
    if (
      token.gatewaySn !== identity.gatewaySn ||
      token.aircraftSn !== identity.aircraftSn
    ) {
      return false;
    }

    const now = this.now();
    const key = agentKey(identity.gatewaySn, identity.aircraftSn);
    const current = this.agents.get(key);
    this.agents.set(key, {
      gatewaySn: identity.gatewaySn,
      aircraftSn: identity.aircraftSn,
      pairedAt: current?.pairedAt ?? now,
      lastSeenAt: now,
      snapshot
    });
    return true;
  }

  listAgents(): MsdkAgentRecord[] {
    return [...this.agents.values()]
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((record) => ({
        ...record,
        snapshot: structuredClone(record.snapshot)
      }));
  }

  private sign(payload: MsdkTokenPayload): string {
    if (!this.signingSecret) {
      throw new Error("msdk_bridge_not_configured");
    }

    const encoded = Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString("base64url");
    const signature = createHmac("sha256", this.signingSecret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string): MsdkTokenPayload | undefined {
    if (!this.signingSecret) return undefined;
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra !== undefined) return undefined;

    const expected = createHmac("sha256", this.signingSecret)
      .update(encoded)
      .digest("base64url");
    if (!safeEqual(signature, expected)) return undefined;

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8")
      );
    } catch {
      return undefined;
    }

    if (!isMsdkTokenPayload(parsed)) return undefined;
    if (parsed.exp <= this.now()) return undefined;
    return parsed;
  }
}

export function isMsdkBridgeSnapshot(
  value: unknown
): value is MsdkBridgeSnapshot {
  if (!isRecord(value)) return false;
  if (value.schema !== "fh2.msdk.v1") return false;
  if (!finiteNumber(value.timestampMs)) return false;
  if (!isRecord(value.sdk)) return false;
  if (typeof value.sdk.registered !== "boolean") return false;
  if (typeof value.sdk.productConnected !== "boolean") return false;

  if (!isRecord(value.gateway)) return false;
  if (typeof value.gateway.connected !== "boolean") return false;
  if (!safeId(value.gateway.serialNumber)) return false;

  if (!isRecord(value.aircraft)) return false;
  if (typeof value.aircraft.flightControllerConnected !== "boolean") {
    return false;
  }
  if (typeof value.aircraft.productType !== "string") return false;
  if (!safeId(value.aircraft.flightControllerSerial)) return false;

  if (!Array.isArray(value.sensors)) return false;
  if (!isRecord(value.rtk)) return false;

  if (!isRecord(value.control)) return false;
  if (typeof value.control.enabled !== "boolean") return false;
  if (typeof value.control.authorityOwner !== "string") return false;

  if (!isRecord(value.capabilities)) return false;
  if (
    !Object.values(value.capabilities).every(
      (entry) => typeof entry === "boolean"
    )
  ) {
    return false;
  }

  return true;
}

function snapshotIdentity(
  snapshot: MsdkBridgeSnapshot
): { gatewaySn: string; aircraftSn: string } | undefined {
  if (!snapshot.sdk.registered || !snapshot.sdk.productConnected) {
    return undefined;
  }
  if (!snapshot.gateway.connected) return undefined;
  if (!snapshot.aircraft.flightControllerConnected) return undefined;
  if (!safeId(snapshot.gateway.serialNumber)) return undefined;
  if (!safeId(snapshot.aircraft.flightControllerSerial)) return undefined;

  return {
    gatewaySn: snapshot.gateway.serialNumber,
    aircraftSn: snapshot.aircraft.flightControllerSerial
  };
}

function isMsdkTokenPayload(value: unknown): value is MsdkTokenPayload {
  if (!isRecord(value)) return false;
  return (
    value.v === 1 &&
    safeId(value.gatewaySn) &&
    safeId(value.aircraftSn) &&
    finiteNumber(value.exp)
  );
}

function agentKey(gatewaySn: string, aircraftSn: string): string {
  return `${gatewaySn}\u0000${aircraftSn}`;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
