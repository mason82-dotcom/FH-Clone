import {
  DrcController,
  type DrcStickChannels,
  type NormalizedStickInput,
  toDjiStickChannels
} from "./drc.js";

export type DrcSessionState =
  | "idle"
  | "requesting"
  | "active"
  | "draining"
  | "closed";

export type DrcSessionHealth = "healthy" | "degraded";

export interface DrcSessionGuards {
  fc3: boolean;
  controlLease: boolean;
  capability: boolean;
  djiAuthority: boolean;
}

export interface DrcSessionRecord {
  aircraftSn: string;
  gatewaySn: string;
  state: DrcSessionState;
  health: DrcSessionHealth;
  createdAt: number;
  updatedAt: number;
  lastInputAt?: number;
  lastNeutralAt?: number;
  closedAt?: number;
  reason?: string;
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

export function evaluateDrcGuards(guards: DrcSessionGuards): DrcGuardResult {
  const missing: Array<keyof DrcSessionGuards> = [];

  if (!guards.fc3) missing.push("fc3");
  if (!guards.controlLease) missing.push("controlLease");
  if (!guards.capability) missing.push("capability");
  if (!guards.djiAuthority) missing.push("djiAuthority");

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * Backend-owned DRC session state machine.
 *
 * State flow:
 * idle/closed -> requesting -> active -> draining -> closed
 *
 * A degraded input stream remains in state=active with health=degraded.
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
  private readonly now: () => number;
  private readonly onStateChange:
    | ((record: DrcSessionRecord) => void | Promise<void>)
    | undefined;
  private readonly onAudit:
    | ((event: DrcSessionAuditEvent) => void | Promise<void>)
    | undefined;

  constructor(
    private readonly controller: DrcController,
    private readonly store: DrcSessionStore,
    options: DrcSessionManagerOptions = {}
  ) {
    this.degradeAfterMs = options.degradeAfterMs ?? 500;
    this.closeAfterMs = options.closeAfterMs ?? 2_000;
    this.checkIntervalMs = options.checkIntervalMs ?? 100;
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
    if (this.sessionTtlMs <= 0) {
      throw new RangeError("sessionTtlMs must be greater than zero");
    }
  }

  async request(input: RequestDrcSession): Promise<DrcSessionRecord> {
    this.assertGuards(input.guards, "request DRC session");

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
      state: "requesting",
      health: "healthy",
      createdAt: now,
      updatedAt: now
    };

    await this.persist(record);
    await this.audit(record, "requesting");
    return { ...record };
  }

  async activate(input: ActivateDrcSession): Promise<DrcSessionRecord> {
    this.assertGuards(input.guards, "activate DRC session");

    const current = await this.require(input.gatewaySn);
    if (current.state !== "requesting") {
      throw new Error(
        `Cannot activate DRC session from state ${current.state}`
      );
    }

    const now = this.now();
    this.controller.resetControlSequence();
    this.controller.startHeartbeat(current.gatewaySn);

    const record: DrcSessionRecord = {
      ...current,
      state: "active",
      health: "healthy",
      updatedAt: now,
      lastInputAt: now
    };

    await this.persist(record);
    this.startTimer(record.gatewaySn);
    await this.audit(record, "activated");
    return { ...record };
  }

  async sendStick(
    gatewaySn: string,
    channels: DrcStickChannels,
    guards: DrcSessionGuards
  ): Promise<number> {
    this.assertGuards(guards, "send DRC stick input");

    const current = await this.requireActive(gatewaySn);
    const seq = await this.controller.sendStickControl(gatewaySn, channels);
    const now = this.now();

    const record = withoutReason({
      ...current,
      health: "healthy",
      updatedAt: now,
      lastInputAt: now
    });

    await this.persist(record);
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
   * Graceful close: active/requesting -> draining -> neutral -> DRC exit -> closed.
   * No automatic RTH is emitted.
   */
  async closeGracefully(
    gatewaySn: string,
    reason = "operator_release"
  ): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);

    if (current.state === "closed") return current;
    if (current.state === "draining") return current;

    this.stopTimer(gatewaySn);

    const draining: DrcSessionRecord = {
      ...current,
      state: "draining",
      updatedAt: this.now(),
      reason
    };
    await this.persist(draining);
    await this.audit(draining, "draining", reason);

    let lastNeutralAt = draining.lastNeutralAt;
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
    } finally {
      this.controller.stopHeartbeat();
    }

    try {
      await this.controller.exitDrcMode(gatewaySn);
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

  async isActive(gatewaySn: string): Promise<boolean> {
    const current = await this.store.get(gatewaySn);
    return current?.state === "active";
  }

  /**
   * Graceful process shutdown. Each still-open session is drained before the
   * process exits. Failures on one gateway do not block cleanup of the others.
   */
  async shutdown(): Promise<void> {
    const open = await this.store.listOpen();

    await Promise.allSettled(
      open.map(async (session) => {
        if (session.state === "active" || session.state === "requesting") {
          await this.closeGracefully(session.gatewaySn, "backend_shutdown");
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
      if (!current || current.state !== "active") {
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

  private async requireActive(gatewaySn: string): Promise<DrcSessionRecord> {
    const current = await this.require(gatewaySn);
    if (current.state !== "active") {
      throw new Error(
        `DRC session for gateway ${gatewaySn} is not active (state=${current.state})`
      );
    }
    return current;
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
