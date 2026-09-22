import {
  type DrcStickChannels,
  type NormalizedStickInput,
  toDjiStickChannels
} from "./drc.js";

export type DrcSessionState =
  | "idle"
  | "requesting"
  | "authorized"
  | "authority_grabbed"
  | "drc_mode_active"
  | "controlling"
  | "degraded"
  | "draining"
  | "closed";

export type DrcSessionHealth = "healthy" | "degraded";

const DRC_TRANSITIONS: Readonly<Record<DrcSessionState, readonly DrcSessionState[]>> = {
  idle: ["requesting"],
  requesting: ["authorized", "closed"],
  authorized: ["authority_grabbed", "closed"],
  authority_grabbed: ["drc_mode_active", "draining", "closed"],
  drc_mode_active: ["controlling", "draining", "closed"],
  controlling: ["degraded", "draining", "closed"],
  degraded: ["controlling", "draining", "closed"],
  draining: ["closed"],
  closed: ["requesting"]
};

export function isAllowedDrcTransition(from: DrcSessionState, to: DrcSessionState): boolean {
  return DRC_TRANSITIONS[from].includes(to);
}

export interface DrcSessionGuards {
  fc3: boolean;
  controlLease: boolean;
  capability: boolean;
  djiAuthority: boolean;
}

export interface DrcSessionRecord {
  aircraftSn: string;
  gatewaySn: string;
  /** Runtime lease holder. Never restored as authorization state after restart. */
  holder: string;
  state: DrcSessionState;
  health: DrcSessionHealth;
  createdAt: number;
  updatedAt: number;
  lastInputAt?: number;
  lastNeutralAt?: number;
  /** Runtime DRC data-plane status. Never rehydrated into authorization after restart. */
  transportConnected: boolean;
  /** Last DJI drc_status_notify state observed on the main broker. */
  lastDrcStatus?: 0 | 1 | 2;
  lastDrcStatusAt?: number;
  closedAt?: number;
  reason?: string;
}

export interface DrcSessionTransport {
  resetControlSequence(): void;
  startHeartbeat(gatewaySn: string): void;
  stopHeartbeat(): void;
  sendStickControl(
    gatewaySn: string,
    channels: DrcStickChannels
  ): Promise<number>;
  sendNeutralStickControl(gatewaySn: string): Promise<number>;
  exitDrcMode(gatewaySn: string): Promise<unknown>;
}

export interface DrcSessionStore {
  get(gatewaySn: string): Promise<DrcSessionRecord | undefined>;
  put(record: DrcSessionRecord, ttlMs: number): Promise<void>;
  listOpen(): Promise<DrcSessionRecord[]>;
  delete(gatewaySn: string): Promise<void>;
}

export class InMemoryDrcSessionStore implements DrcSessionStore {
  private readonly records = new Map<
    string,
    { record: DrcSessionRecord; expiresAt: number }
  >;

  constructor(private readonly now: () => number = Date.now) {}

  async get(gatewaySn: string): Promise<DrcSessionRecord | undefined> {
    const entry = this.records.get(gatewaySn);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.records.delete(gatewaySn);
      return undefined;
    }
    return { ...entry.record };
  }

  async put(record: DrcSessionRecord, ttlMs: number): Promise<void> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("DRC session store ttlMs must be greater than zero");
    }
    this.records.set(record.gatewaySn, {
      record: { ...record },
      expiresAt: this.now() + ttlMs
    });
  }

  async listOpen(): Promise<DrcSessionRecord[]> {
    const now = this.now();
    const open: DrcSessionRecord[] = [];

    for (const [gatewaySn, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(gatewaySn);
        continue;
      }
      if (entry.record.state !== "closed" && entry.record.state !== "idle") {
        open.push({ ...entry.record });
      }
    }

    return open;
  }

  async delete(gatewaySn: string): Promise<void> {
    this.records.delete(gatewaySn);
  }
}

export interface DrcSessionManagerOptions {
  /** Maximum age of drc_status_notify before the RC-side DRC state becomes unknown. */
  drcStatusStaleAfterMs?: number;
  /** Local FH-Clone dead-man threshold; not a DJI protocol constant. */
  degradeAfterMs?: number;
  /** Local FH-Clone close threshold; not a DJI protocol constant. */
  closeAfterMs?: number;
  checkIntervalMs?: number;
  /** Store TTL is capped here even if a future broker session lives longer. */
  sessionTtlMs?: number;
  now?: () => number;
  onStateChange?: (record: DrcSessionRecord) => void | Promise<void>;
  onAudit?: (event: DrcSessionAuditEvent) => void | Promise<void>;
}

export interface DrcSessionAuditEvent {
  gatewaySn: string;
  aircraftSn: string;
  at: number;
  event:
    | "requesting"
    | "activated"
    | "degraded"
    | "input"
    | "draining"
    | "neutral_sent"
    | "closed"
    | "force_closed";
  reason?: string;
}

export interface RequestDrcSession {
  aircraftSn: string;
  gatewaySn: string;
  holder: string;
  guards: DrcSessionGuards;
}

export interface ActivateDrcSession {
  gatewaySn: string;
  guards: DrcSessionGuards;
}

export interface DrcGuardFailure {
  ok: false;
  missing: Array<keyof DrcSessionGuards>;
}

export interface DrcGuardSuccess {
  ok: true;
}

export type DrcGuardResult = DrcGuardSuccess | DrcGuardFailure;

export function evaluateDrcRequestGuards(
  guards: DrcSessionGuards
): DrcGuardResult {
  const missing: Array<keyof DrcSessionGuards> = [];

  if (!guards.fc3) missing.push("fc3");
  if (!guards.controlLease) missing.push("controlLease");
  if (!guards.capability) missing.push("capability");

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export function evaluateDrcGuards(guards: DrcSessionGuards): DrcGuardResult {
  const request = evaluateDrcRequestGuards(guards);
  if (!request.ok) return request;
  return guards.djiAuthority
    ? { ok: true }
    : { ok: false, missing: ["djiAuthority"] };
}

/**
 * Backend-owned DRC session state machine.
 *
 * State flow:
 * idle/closed -> requesting -> authorized -> authority_grabbed ->
 * drc_mode_active -> controlling <-> degraded -> draining -> closed.
 *
 * DJI authority loss force-closes immediately without attempting a neutral
 * publish, because command authority is no longer guaranteed.
 */
export class DrcSessionManager {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly ticks = new Set<string>();

  private readonly degradeAfterMs: number;
  private readonly closeAfterMs: number;
  private readonly checkIntervalMs: number;
  private readonly sessionTtlMs: number;
  private readonly drcStatusStaleAfterMs: number;
  private readonly now: () => number;
  private readonly onStateChange:
    | ((record: DrcSessionRecord) => void | Promise<void>)
    | undefined;
  private readonly onAudit:
    | ((event: DrcSessionAuditEvent) => void | Promise<void>)
    | undefined;

  constructor(
    private readonly controller: DrcSessionTransport,
    private readonly store: DrcSessionStore,
    options: DrcSessionManagerOptions = {}
  ) {
    this.degradeAfterMs = options.degradeAfterMs ?? 500;
    this.closeAfterMs = options.closeAfterMs ?? 2_000;
    this.checkIntervalMs = options.checkIntervalMs ?? 100;
    this.drcStatusStaleAfterMs = options.drcStatusStaleAfterMs ?? 30_000;
    this.sessionTtlMs = Math.min(
      options.sessionTtlMs ?? 24 * 60 * 60 * 1_000,
      24 * 60 * 60 * 1_000
    );
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;
    this.onAudit = options.onAudit;

    if (this.degradeAfterMs <= 0) {
      throw new RangeError("degradeAfterMs must be greater than zero");
    }
    if (this.closeAfterMs <= this.degradeAfterMs) {
      throw new RangeError("closeAfterMs must be greater than degradeAfterMs");
    }
    if (this.checkIntervalMs <= 0) {
      throw new RangeError("checkIntervalMs must be greater than zero");
    }
    if (this.drcStatusStaleAfterMs <= 0) {
      throw new RangeError("drcStatusStaleAfterMs must be greater than zero");
    }
    if (this.sessionTtlMs <= 0) {
      throw new RangeError("sessionTtlMs must be greater than zero");
    }
  }

  async request(input: RequestDrcSession): Promise<DrcSessionRecord> {
    this.assertRequestGuards(input.guards, "request DRC session");

    const existing = await this.store.get(input.gatewaySn);
    if (
      existing &&
      existing.state !== "closed" &&
      existing.state !== "idle"
    ) {
      throw new Error(
        `Gateway ${input.gatewaySn} already has DRC session state ${existing.state}`
      );
    }

    const now = this.now();
    const record: DrcSessionRecord = {
      aircraftSn: input.aircraftSn,
      gatewaySn: input.gatewaySn,
      holder: input.holder,
      state: "requesting",
      health: "healthy",
      createdAt: now,
      updatedAt: now,
      transportConnected: false
    };

    await this.persist(record);
    await this.audit(record, "requesting");
    return { ...record };
  }

  async markAuthorized(gatewaySn: string): Promise<DrcSessionRecord> {
    return this.transitionState(gatewaySn, "requesting", "authorized");
  }

  async markAuthorityGrabbed(gatewaySn: string): Promise<DrcSessionRecord> {
    return this.transitionState(gatewaySn, "authorized", "authority_grabbed");
  }

  async markDrcModeActive(gatewaySn: string): Promise<DrcSessionRecord> {
    return this.transitionState(gatewaySn, "authority_grabbed", "drc_mode_active");
  }

  async setTransportConnected(gatewaySn: string, connected: boolean): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);
    const record = { ...current, transportConnected: connected, updatedAt: this.now() };
    await this.persist(record);
    return { ...record };
  }

  async applyDrcStatus(gatewaySn: string, drcState: 0 | 1 | 2): Promise<DrcSessionRecord | undefined> {
    const current = await this.store.get(gatewaySn);
    if (!current || current.state === "closed" || current.state === "idle") return current;
    const record = {
      ...current,
      lastDrcStatus: drcState,
      lastDrcStatusAt: this.now(),
      updatedAt: this.now()
    };
    await this.persist(record);
    return { ...record };
  }

  async getDrcStatus(gatewaySn: string): Promise<0 | 1 | 2 | "unknown"> {
    const current = await this.store.get(gatewaySn);
    if (!current || current.lastDrcStatus === undefined || current.lastDrcStatusAt === undefined) {
      return "unknown";
    }
    if (this.now() - current.lastDrcStatusAt > this.drcStatusStaleAfterMs) return "unknown";
    return current.lastDrcStatus;
  }

  async markTransportLost(gatewaySn: string, reason = "transport_lost"): Promise<DrcSessionRecord | undefined> {
    const current = await this.store.get(gatewaySn);
    if (!current || current.state === "closed" || current.state === "idle") return current;
    const record = { ...current, transportConnected: false, updatedAt: this.now(), reason };
    await this.persist(record);
    return { ...record };
  }

  async activate(input: ActivateDrcSession): Promise<DrcSessionRecord> {
    this.assertGuards(input.guards, "activate DRC session");

    const current = await this.require(input.gatewaySn);
    if (current.state !== "drc_mode_active") {
      throw new Error(
        `Cannot activate DRC session from state ${current.state}`
      );
    }
    if (!current.transportConnected) {
      throw new Error("Cannot activate DRC session while DRC transport is disconnected");
    }

    this.controller.resetControlSequence();
    this.controller.startHeartbeat(current.gatewaySn);
    await this.audit(current, "activated");
    return { ...current };
  }

  async sendStick(
    gatewaySn: string,
    channels: DrcStickChannels,
    guards: DrcSessionGuards
  ): Promise<number> {
    this.assertGuards(guards, "send DRC stick input");

    const current = await this.require(gatewaySn);
    if (current.state !== "drc_mode_active" && current.state !== "controlling" && current.state !== "degraded") {
      throw new Error(`DRC session for gateway ${gatewaySn} cannot accept stick input (state=${current.state})`);
    }
    if (!current.transportConnected) {
      throw new Error(`DRC transport for gateway ${gatewaySn} is disconnected`);
    }
    const seq = await this.controller.sendStickControl(gatewaySn, channels);
    const now = this.now();

    const record = withoutReason({
      ...current,
      state: "controlling",
      health: "healthy",
      updatedAt: now,
      lastInputAt: now
    });

    await this.persist(record);
    if (current.state === "drc_mode_active") this.startTimer(gatewaySn);
    await this.audit(record, "input");
    return seq;
  }

  async sendNormalizedStick(
    gatewaySn: string,
    input: NormalizedStickInput,
    guards: DrcSessionGuards
  ): Promise<number> {
    return this.sendStick(gatewaySn, toDjiStickChannels(input), guards);
  }

  /**
   * Re-evaluates runtime safety guards.
   * DJI authority loss closes immediately without a neutral publish.
   * Loss of FH-Clone stage/lease/capability drains while DJI authority still exists.
   */
  async reevaluateGuards(
    gatewaySn: string,
    guards: DrcSessionGuards
  ): Promise<DrcSessionRecord | undefined> {
    const current = await this.store.get(gatewaySn);
    if (!current || current.state === "closed" || current.state === "idle") {
      return current;
    }

    if (!guards.djiAuthority) {
      return this.forceClose(gatewaySn, "dji_authority_lost");
    }

    const requestGuards = evaluateDrcRequestGuards(guards);
    if (!requestGuards.ok) {
      return this.closeGracefully(
        gatewaySn,
        `guard_lost:${requestGuards.missing.join(",")}`
      );
    }

    return current;
  }

  /**
   * Graceful close: setup-only states close directly; entered/controlling states
   * drain, optionally send one neutral frame, attempt DRC exit, then close.
   * No automatic RTH is emitted.
   */
  async closeGracefully(
    gatewaySn: string,
    reason = "operator_release"
  ): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);

    if (current.state === "closed") return current;
    if (current.state === "draining") return current;

    if (current.state === "requesting" || current.state === "authorized") {
      return this.forceClose(gatewaySn, reason);
    }

    this.stopTimer(gatewaySn);

    if (!isAllowedDrcTransition(current.state, "draining")) {
      throw new Error(`Invalid DRC transition ${current.state}->draining`);
    }

    const draining: DrcSessionRecord = {
      ...current,
      state: "draining",
      updatedAt: this.now(),
      reason
    };
    await this.persist(draining);
    await this.audit(draining, "draining", reason);

    let lastNeutralAt = draining.lastNeutralAt;
    const shouldNeutral =
      current.transportConnected &&
      (current.state === "controlling" || current.state === "degraded");

    try {
      if (shouldNeutral) {
        try {
          await this.controller.sendNeutralStickControl(gatewaySn);
          lastNeutralAt = this.now();
          await this.audit(
            {
              ...draining,
              ...(lastNeutralAt !== undefined ? { lastNeutralAt } : {})
            },
            "neutral_sent",
            reason
          );
        } catch {
          // Cleanup must continue even if the data-plane is already unavailable.
        }
      }
    } finally {
      this.controller.stopHeartbeat();
    }

    try {
      if (
        current.state === "authority_grabbed" ||
        current.state === "drc_mode_active" ||
        current.state === "controlling" ||
        current.state === "degraded"
      ) {
        await this.controller.exitDrcMode(gatewaySn);
      }
    } catch {
      // The session still closes locally; runtime authorization must fail closed.
    } finally {
      return this.finishClosed(draining, reason, lastNeutralAt, false);
    }
  }

  /**
   * Authority loss or an unrecoverable transport condition: close immediately.
   * No neutral command is forced because DJI command authority may already be gone.
   */
  async forceClose(
    gatewaySn: string,
    reason = "authority_lost"
  ): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);
    this.stopTimer(gatewaySn);
    this.controller.stopHeartbeat();
    return this.finishClosed(current, reason, current.lastNeutralAt, true);
  }

  async get(gatewaySn: string): Promise<DrcSessionRecord | undefined> {
    return this.store.get(gatewaySn);
  }

  async listOpenSessions(): Promise<DrcSessionRecord[]> {
    return this.store.listOpen();
  }

  async isActive(gatewaySn: string): Promise<boolean> {
    const current = await this.store.get(gatewaySn);
    return Boolean(
      current?.transportConnected &&
      (current.state === "controlling" || current.state === "degraded")
    );
  }

  /** Deterministic dead-man evaluation hook used by tests and schedulers. */
  async checkDeadman(gatewaySn: string): Promise<void> {
    await this.tick(gatewaySn);
  }

  /**
   * Graceful process shutdown. Each still-open session is drained before the
   * process exits. Failures on one gateway do not block cleanup of the others.
   */
  async shutdown(): Promise<void> {
    const open = await this.store.listOpen();

    await Promise.allSettled(
      open.map(async (session) => {
        if (session.state === "controlling" || session.state === "degraded" || session.state === "drc_mode_active" || session.state === "authority_grabbed") {
          await this.closeGracefully(session.gatewaySn, "backend_shutdown");
          return;
        }
        if (session.state === "authorized" || session.state === "requesting") {
          await this.forceClose(session.gatewaySn, "backend_shutdown");
          return;
        }
        if (session.state === "draining") {
          await this.forceClose(session.gatewaySn, "backend_shutdown");
        }
      })
    );

    for (const gatewaySn of [...this.timers.keys()]) {
      this.stopTimer(gatewaySn);
    }
  }

  private async tick(gatewaySn: string): Promise<void> {
    if (this.ticks.has(gatewaySn)) return;
    this.ticks.add(gatewaySn);

    try {
      const current = await this.store.get(gatewaySn);
      if (!current || (current.state !== "controlling" && current.state !== "degraded")) {
        this.stopTimer(gatewaySn);
        return;
      }

      const lastInputAt = current.lastInputAt ?? current.updatedAt;
      const silenceMs = this.now() - lastInputAt;

      if (silenceMs >= this.closeAfterMs) {
        await this.closeGracefully(gatewaySn, "deadman_timeout");
        return;
      }

      if (
        silenceMs >= this.degradeAfterMs &&
        current.health !== "degraded"
      ) {
        const degraded: DrcSessionRecord = {
          ...current,
          state: "degraded",
          health: "degraded",
          updatedAt: this.now(),
          reason: "input_stale"
        };

        await this.persist(degraded);
        await this.audit(degraded, "degraded", "input_stale");
      }
    } finally {
      this.ticks.delete(gatewaySn);
    }
  }

  private startTimer(gatewaySn: string): void {
    this.stopTimer(gatewaySn);
    const timer = setInterval(() => {
      void this.tick(gatewaySn);
    }, this.checkIntervalMs);
    this.timers.set(gatewaySn, timer);
  }

  private stopTimer(gatewaySn: string): void {
    const timer = this.timers.get(gatewaySn);
    if (timer) clearInterval(timer);
    this.timers.delete(gatewaySn);
  }

  private async require(gatewaySn: string): Promise<DrcSessionRecord> {
    const current = await this.store.get(gatewaySn);
    if (!current) {
      throw new Error(`No DRC session exists for gateway ${gatewaySn}`);
    }
    return current;
  }

  private assertRequestGuards(
    guards: DrcSessionGuards,
    operation: string
  ): void {
    const result = evaluateDrcRequestGuards(guards);
    if (!result.ok) {
      throw new Error(
        `Cannot ${operation}; missing guards: ${result.missing.join(", ")}`
      );
    }
  }

  private assertGuards(guards: DrcSessionGuards, operation: string): void {
    const result = evaluateDrcGuards(guards);
    if (!result.ok) {
      throw new Error(
        `Cannot ${operation}; missing guards: ${result.missing.join(", ")}`
      );
    }
  }

  private async finishClosed(
    current: DrcSessionRecord,
    reason: string,
    lastNeutralAt: number | undefined,
    forced: boolean
  ): Promise<DrcSessionRecord> {
    const now = this.now();
    const closed: DrcSessionRecord = {
      ...current,
      state: "closed",
      transportConnected: false,
      updatedAt: now,
      closedAt: now,
      ...(lastNeutralAt !== undefined ? { lastNeutralAt } : {}),
      reason
    };

    await this.persist(closed);
    await this.audit(
      closed,
      forced ? "force_closed" : "closed",
      reason
    );
    return { ...closed };
  }

  private async transitionState(
    gatewaySn: string,
    expected: DrcSessionState,
    next: DrcSessionState
  ): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);
    if (current.state !== expected || !isAllowedDrcTransition(current.state, next)) {
      throw new Error(`Invalid DRC transition ${current.state}->${next}; expected ${expected}`);
    }
    const record = { ...current, state: next, updatedAt: this.now() };
    await this.persist(record);
    return { ...record };
  }

  private async persist(record: DrcSessionRecord): Promise<void> {
    await this.store.put(record, this.sessionTtlMs);
    await this.onStateChange?.({ ...record });
  }

  private async audit(
    record: DrcSessionRecord,
    event: DrcSessionAuditEvent["event"],
    reason?: string
  ): Promise<void> {
    await this.onAudit?.({
      gatewaySn: record.gatewaySn,
      aircraftSn: record.aircraftSn,
      at: this.now(),
      event,
      ...(reason !== undefined ? { reason } : {})
    });
  }
}

function withoutReason(record: DrcSessionRecord): DrcSessionRecord {
  const { reason: _reason, ...rest } = record;
  return rest;
}
