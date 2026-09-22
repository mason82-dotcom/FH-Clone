import {
  DrcController,
  type DrcStickChannels,
  type NormalizedStickInput,
  toDjiStickChannels
} from "./drc.js";

export type DrcSessionState =
  | "idle"
  | "active"
  | "degraded"
  | "lost"
  | "stopping"
  | "stopped";

export interface DrcSessionSnapshot {
  aircraftSn: string;
  gatewaySn: string;
  state: DrcSessionState;
  startedAt: number;
  lastInputAt: number;
  lastNeutralAt?: number;
  reason?: string;
}

export interface DrcSessionManagerOptions {
  /**
   * Local FH-Clone dead-man threshold. This is not a DJI protocol constant.
   * When exceeded, one neutral stick command is sent.
   */
  neutralAfterMs?: number;
  /**
   * Local FH-Clone loss threshold. This is not a DJI protocol constant.
   * When exceeded, the heartbeat is stopped and the session becomes lost.
   */
  lostAfterMs?: number;
  checkIntervalMs?: number;
  now?: () => number;
  onStateChange?: (snapshot: DrcSessionSnapshot) => void;
}

export interface AttachDrcSession {
  aircraftSn: string;
  gatewaySn: string;
}

export class DrcSessionManager {
  private session: DrcSessionSnapshot | undefined;
  private timer: NodeJS.Timeout | undefined;
  private tickRunning = false;

  private readonly neutralAfterMs: number;
  private readonly lostAfterMs: number;
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private readonly onStateChange: ((snapshot: DrcSessionSnapshot) => void) | undefined;

  constructor(
    private readonly controller: DrcController,
    private readonly isAuthorityActive: (gatewaySn: string) => boolean,
    options: DrcSessionManagerOptions = {}
  ) {
    this.neutralAfterMs = options.neutralAfterMs ?? 500;
    this.lostAfterMs = options.lostAfterMs ?? 2_000;
    this.checkIntervalMs = options.checkIntervalMs ?? 100;
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;

    if (this.neutralAfterMs <= 0) {
      throw new RangeError("neutralAfterMs must be greater than zero");
    }
    if (this.lostAfterMs <= this.neutralAfterMs) {
      throw new RangeError("lostAfterMs must be greater than neutralAfterMs");
    }
    if (this.checkIntervalMs <= 0) {
      throw new RangeError("checkIntervalMs must be greater than zero");
    }
  }

  get snapshot(): DrcSessionSnapshot | undefined {
    return this.session ? { ...this.session } : undefined;
  }

  /**
   * Attaches to a DRC link that has already completed authorization,
   * broker provisioning and drc_mode_enter.
   */
  attachActiveSession(input: AttachDrcSession): DrcSessionSnapshot {
    if (!this.isAuthorityActive(input.gatewaySn)) {
      throw new Error(
        `Cannot attach DRC session for ${input.aircraftSn}: cloud-control authority is not active`
      );
    }

    this.stopTimer();
    this.controller.resetControlSequence();

    const now = this.now();
    this.session = {
      aircraftSn: input.aircraftSn,
      gatewaySn: input.gatewaySn,
      state: "active",
      startedAt: now,
      lastInputAt: now
    };

    this.controller.startHeartbeat(input.gatewaySn);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.checkIntervalMs);

    this.emit();
    return { ...this.session };
  }

  async sendStick(
    aircraftSn: string,
    channels: DrcStickChannels
  ): Promise<number> {
    const session = this.requireControllableSession(aircraftSn);

    if (!this.isAuthorityActive(session.gatewaySn)) {
      await this.lose("authority_lost");
      throw new Error("DJI cloud-control authority is no longer active");
    }

    const seq = await this.controller.sendStickControl(session.gatewaySn, channels);
    const now = this.now();

    const { reason: _reason, ...rest } = session;
    this.session = {
      ...rest,
      state: "active",
      lastInputAt: now
    };
    this.emit();
    return seq;
  }

  async sendNormalizedStick(
    aircraftSn: string,
    input: NormalizedStickInput
  ): Promise<number> {
    return this.sendStick(aircraftSn, toDjiStickChannels(input));
  }

  /**
   * Explicit operator shutdown. Neutralizes first, stops heartbeat and then
   * exits DRC mode. It does not trigger RTH.
   */
  async close(reason = "operator_release"): Promise<void> {
    const session = this.session;
    if (!session || session.state === "stopped") return;

    this.session = { ...session, state: "stopping", reason };
    this.emit();
    this.stopTimer();

    try {
      await this.controller.sendNeutralStickControl(session.gatewaySn);
    } finally {
      this.controller.stopHeartbeat();
    }

    try {
      await this.controller.exitDrcMode(session.gatewaySn);
    } finally {
      const now = this.now();
      this.session = {
        ...session,
        state: "stopped",
        lastInputAt: session.lastInputAt,
        lastNeutralAt: now,
        reason
      };
      this.emit();
    }
  }

  /**
   * Marks a transport failure without issuing higher-level flight actions.
   * A best-effort neutral command is attempted, then heartbeat is stopped.
   */
  async markTransportLost(reason = "transport_lost"): Promise<void> {
    await this.lose(reason);
  }

  private requireControllableSession(aircraftSn: string): DrcSessionSnapshot {
    const session = this.session;
    if (!session) throw new Error("No active DRC session");
    if (session.aircraftSn !== aircraftSn) {
      throw new Error(
        `DRC session belongs to ${session.aircraftSn}, not ${aircraftSn}`
      );
    }
    if (session.state === "lost" || session.state === "stopping" || session.state === "stopped") {
      throw new Error(`DRC session is not controllable in state ${session.state}`);
    }
    return session;
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;

    try {
      const session = this.session;
      if (!session || session.state === "lost" || session.state === "stopped") return;

      if (!this.isAuthorityActive(session.gatewaySn)) {
        await this.lose("authority_lost");
        return;
      }

      const now = this.now();
      const silenceMs = now - session.lastInputAt;

      if (silenceMs >= this.lostAfterMs) {
        await this.lose("input_timeout");
        return;
      }

      if (silenceMs >= this.neutralAfterMs && session.state === "active") {
        await this.controller.sendNeutralStickControl(session.gatewaySn);
        this.session = {
          ...session,
          state: "degraded",
          lastNeutralAt: this.now(),
          reason: "input_stale"
        };
        this.emit();
      }
    } finally {
      this.tickRunning = false;
    }
  }

  private async lose(reason: string): Promise<void> {
    const session = this.session;
    if (!session || session.state === "lost" || session.state === "stopped") return;

    this.stopTimer();

    let lastNeutralAt = session.lastNeutralAt;
    try {
      await this.controller.sendNeutralStickControl(session.gatewaySn);
      lastNeutralAt = this.now();
    } catch {
      // Best effort only: on transport/authority loss even neutral may fail.
    } finally {
      this.controller.stopHeartbeat();
    }

    this.session = {
      ...session,
      state: "lost",
      ...(lastNeutralAt !== undefined ? { lastNeutralAt } : {}),
      reason
    };
    this.emit();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private emit(): void {
    if (this.session) this.onStateChange?.({ ...this.session });
  }
}
