export type DjiCloudControlAuthStatus =
  | "unknown"
  | "pending"
  | "authorized"
  | "denied"
  | "canceled"
  | "released"
  | "timeout";

export interface DjiCloudControlAuthorityState {
  gatewaySn: string;
  status: DjiCloudControlAuthStatus;
  authorized: boolean;
  updatedAt: number;
  source: "local" | "event" | "state";
  result?: number;
  controlKeys?: string[];
}

type AuthoritySubscriber = (state: DjiCloudControlAuthorityState) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageData(message: unknown): Record<string, unknown> | undefined {
  if (!isRecord(message)) return undefined;
  return isRecord(message.data) ? message.data : message;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length === value.length ? values : undefined;
}

export class DjiCloudControlAuthorityRegistry {
  private readonly states = new Map<string, DjiCloudControlAuthorityState>();
  private readonly subscribers = new Map<string, Set<AuthoritySubscriber>>();

  get(gatewaySn: string): DjiCloudControlAuthorityState | undefined {
    const state = this.states.get(gatewaySn);
    return state ? clone(state) : undefined;
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

  markDenied(
    gatewaySn: string,
    updatedAt = Date.now(),
    result?: number
  ): DjiCloudControlAuthorityState {
    return this.set({
      gatewaySn,
      status: "denied",
      authorized: false,
      updatedAt,
      source: "local",
      ...(result !== undefined ? { result } : {})
    });
  }

  markTimeout(
    gatewaySn: string,
    updatedAt = Date.now()
  ): DjiCloudControlAuthorityState {
    return this.set({
      gatewaySn,
      status: "timeout",
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
    if (!data) return undefined;

    // Current DJI Pilot Cloud property contract:
    // cloud_control_auth: ["flight", ...]
    const controlKeys = stringArray(data.cloud_control_auth);

    // Compatibility with older/alternate state payloads seen in previous code.
    const legacyAuthorized =
      typeof data.is_cloud_control_auth === "boolean"
        ? data.is_cloud_control_auth
        : undefined;

    if (!controlKeys && legacyAuthorized === undefined) return undefined;

    const authorized = controlKeys
      ? controlKeys.includes("flight")
      : legacyAuthorized ?? false;

    const current = this.states.get(gatewaySn);

    // While the pilot-consent popup is pending, a state frame that still does
    // not list "flight" must not be treated as a denial. The authoritative
    // outcome is cloud_control_auth_notify.
    if (!authorized && current?.status === "pending") {
      return this.set({
        ...current,
        authorized: false,
        updatedAt,
        source: "state",
        ...(controlKeys ? { controlKeys } : {})
      });
    }

    return this.set({
      gatewaySn,
      status: authorized ? "authorized" : "released",
      authorized,
      updatedAt,
      source: "state",
      ...(controlKeys ? { controlKeys } : {})
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
        ...(result !== undefined ? { result } : {}),
        controlKeys: ["flight"]
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

  waitForTerminal(
    gatewaySn: string,
    timeoutMs: number
  ): Promise<DjiCloudControlAuthorityState> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("Cloud-control authorization timeout must be greater than zero");
    }

    const current = this.states.get(gatewaySn);
    if (current && isTerminal(current.status)) {
      return Promise.resolve(clone(current));
    }

    return new Promise((resolve) => {
      const subscriber: AuthoritySubscriber = (state) => {
        if (!isTerminal(state.status)) return;
        cleanup();
        resolve(clone(state));
      };

      const timeout = setTimeout(() => {
        const timedOut = this.markTimeout(gatewaySn);
        cleanup();
        resolve(timedOut);
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        const set = this.subscribers.get(gatewaySn);
        set?.delete(subscriber);
        if (set?.size === 0) this.subscribers.delete(gatewaySn);
      };

      const set = this.subscribers.get(gatewaySn) ?? new Set<AuthoritySubscriber>();
      set.add(subscriber);
      this.subscribers.set(gatewaySn, set);
    });
  }

  private set(state: DjiCloudControlAuthorityState): DjiCloudControlAuthorityState {
    const stored = clone(state);
    this.states.set(state.gatewaySn, stored);

    for (const subscriber of this.subscribers.get(state.gatewaySn) ?? []) {
      subscriber(clone(stored));
    }

    return clone(stored);
  }
}

function isTerminal(status: DjiCloudControlAuthStatus): boolean {
  return (
    status === "authorized" ||
    status === "denied" ||
    status === "canceled" ||
    status === "released" ||
    status === "timeout"
  );
}

function clone(state: DjiCloudControlAuthorityState): DjiCloudControlAuthorityState {
  return {
    ...state,
    ...(state.controlKeys ? { controlKeys: [...state.controlKeys] } : {})
  };
}
