export type DjiCloudControlAuthStatus =
  | "unknown"
  | "pending"
  | "authorized"
  | "denied"
  | "canceled"
  | "released";

export interface DjiCloudControlAuthorityState {
  gatewaySn: string;
  status: DjiCloudControlAuthStatus;
  authorized: boolean;
  updatedAt: number;
  source: "local" | "event" | "state";
  result?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageData(message: unknown): Record<string, unknown> | undefined {
  if (!isRecord(message)) return undefined;
  return isRecord(message.data) ? message.data : message;
}

export class DjiCloudControlAuthorityRegistry {
  private readonly states = new Map<string, DjiCloudControlAuthorityState>();

  get(gatewaySn: string): DjiCloudControlAuthorityState | undefined {
    return this.states.get(gatewaySn);
  }

  isAuthorized(gatewaySn: string): boolean {
    return this.states.get(gatewaySn)?.authorized ?? false;
  }

  markPending(gatewaySn: string, updatedAt = Date.now()): DjiCloudControlAuthorityState {
    return this.set({
      gatewaySn,
      status: "pending",
      authorized: false,
      updatedAt,
      source: "local"
    });
  }

  markReleased(gatewaySn: string, updatedAt = Date.now()): DjiCloudControlAuthorityState {
    return this.set({
      gatewaySn,
      status: "released",
      authorized: false,
      updatedAt,
      source: "local"
    });
  }

  applyState(
    gatewaySn: string,
    message: unknown,
    updatedAt = Date.now()
  ): DjiCloudControlAuthorityState | undefined {
    const data = messageData(message);
    if (!data || typeof data.is_cloud_control_auth !== "boolean") return undefined;

    const authorized = data.is_cloud_control_auth;
    const current = this.states.get(gatewaySn);

    if (!authorized && current?.status === "pending") {
      return this.set({
        ...current,
        authorized: false,
        updatedAt,
        source: "state"
      });
    }

    return this.set({
      gatewaySn,
      status: authorized ? "authorized" : "released",
      authorized,
      updatedAt,
      source: "state"
    });
  }

  applyEvent(
    gatewaySn: string,
    message: unknown,
    updatedAt = Date.now()
  ): DjiCloudControlAuthorityState | undefined {
    if (!isRecord(message) || message.method !== "cloud_control_auth_notify") {
      return undefined;
    }

    const data = messageData(message);
    if (!data) return undefined;
    const result = typeof data.result === "number" ? data.result : undefined;
    const output = isRecord(data.output) ? data.output : undefined;
    const status = typeof output?.status === "string" ? output.status : undefined;

    if (status === "ok" && (result === undefined || result === 0)) {
      return this.set({
        gatewaySn,
        status: "authorized",
        authorized: true,
        updatedAt,
        source: "event",
        ...(result !== undefined ? { result } : {})
      });
    }

    if (status === "canceled") {
      return this.set({
        gatewaySn,
        status: "canceled",
        authorized: false,
        updatedAt,
        source: "event",
        ...(result !== undefined ? { result } : {})
      });
    }

    if (status === "failed" || (result !== undefined && result !== 0)) {
      return this.set({
        gatewaySn,
        status: "denied",
        authorized: false,
        updatedAt,
        source: "event",
        ...(result !== undefined ? { result } : {})
      });
    }

    return undefined;
  }

  private set(state: DjiCloudControlAuthorityState): DjiCloudControlAuthorityState {
    this.states.set(state.gatewaySn, state);
    return state;
  }
}
