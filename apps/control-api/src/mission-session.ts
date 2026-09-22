import { randomUUID } from "node:crypto";
import type { RawMessage } from "@fh-clone/aircraft-core";

export type MissionEndReason =
  | "standby"
  | "telemetry_timeout"
  | "device_disconnected"
  | "manual";

export type MissionActivity =
  | "manual_flight"
  | "automatic_takeoff"
  | "wayline"
  | "panorama"
  | "intelligent_tracking"
  | "adsb_avoidance"
  | "return_to_home"
  | "automatic_landing"
  | "forced_landing"
  | "three_blade_landing"
  | "apas"
  | "virtual_stick"
  | "live_flight_control"
  | "airborne_rtk_fixing";

export interface AutoMissionSession {
  missionId: string;
  deviceId: string;
  gatewaySn?: string;
  source: "automatic";
  startedAt: number;
  endedAt?: number;
  endReason?: MissionEndReason;
  lastTelemetryAt: number;
  lastModeCode?: number;
  lastActivity?: MissionActivity;
  /** True once mode_code=5 was observed in this runtime mission session. */
  waylineObserved: boolean;
}

export type MissionSessionEvent =
  | { type: "started"; session: AutoMissionSession }
  | { type: "ended"; session: AutoMissionSession };

export interface MissionSessionTrackerOptions {
  standbyGraceMs?: number;
  disconnectedGraceMs?: number;
  telemetryTimeoutMs?: number;
  resolveGatewaySn?: (deviceId: string) => string | undefined;
}

interface DeviceFlightState {
  active: AutoMissionSession | undefined;
  lastCompleted: AutoMissionSession | undefined;
  standbySince: number | undefined;
  disconnectedSince: number | undefined;
}

type Subscriber = (event: MissionSessionEvent) => void;

const DEFAULT_STANDBY_GRACE_MS = 5_000;
const DEFAULT_DISCONNECTED_GRACE_MS = 30_000;
const DEFAULT_TELEMETRY_TIMEOUT_MS = 30_000;

// DJI Cloud API aircraft mode_code values considered flight-active.
// 0 = Standby, 13 = Upgrading, 14 = Not connected are intentionally excluded.
// 1/2 are takeoff preparation states and do not start an automatic flight session.
const FLIGHT_ACTIVE_MODES = new Set([
  3,  // Manual flight
  4,  // Automatic takeoff
  5,  // Wayline flight
  6,  // Panoramic photography
  7,  // Intelligent tracking
  8,  // ADS-B avoidance
  9,  // Auto return to home
  10, // Automatic landing
  11, // Forced landing
  12, // Three-blade landing
  15, // APAS
  16, // Virtual stick state
  17, // Live flight controls
  18  // Airborne RTK fixing mode
]);

export class MissionSessionTracker {
  private readonly states = new Map<string, DeviceFlightState>();
  private readonly subscribers = new Set<Subscriber>();

  private readonly standbyGraceMs: number;
  private readonly disconnectedGraceMs: number;
  private readonly telemetryTimeoutMs: number;
  private readonly resolveGatewaySn?: (deviceId: string) => string | undefined;

  constructor(options: MissionSessionTrackerOptions = {}) {
    this.standbyGraceMs = options.standbyGraceMs ?? DEFAULT_STANDBY_GRACE_MS;
    this.disconnectedGraceMs =
      options.disconnectedGraceMs ?? DEFAULT_DISCONNECTED_GRACE_MS;
    this.telemetryTimeoutMs =
      options.telemetryTimeoutMs ?? DEFAULT_TELEMETRY_TIMEOUT_MS;
    this.resolveGatewaySn = options.resolveGatewaySn;
  }

  observe(message: RawMessage): AutoMissionSession | undefined {
    if (!message.deviceId) return undefined;
    if (!message.channel.endsWith("/osd") && !message.channel.endsWith("/state")) {
      return this.getActive(message.deviceId);
    }

    const modeCode = extractModeCode(message.payload);
    const state =
      this.states.get(message.deviceId) ?? {
        active: undefined,
        lastCompleted: undefined,
        standbySince: undefined,
        disconnectedSince: undefined
      };
    this.states.set(message.deviceId, state);

    if (state.active) {
      state.active.lastTelemetryAt = message.receivedAt;
      if (modeCode !== undefined) {
        state.active.lastModeCode = modeCode;
        const activity = classifyMissionActivity(modeCode);
        if (activity) state.active.lastActivity = activity;
        if (modeCode === 5) state.active.waylineObserved = true;
      }

      if (!state.active.gatewaySn) {
        const gatewaySn = this.resolveGatewaySn?.(message.deviceId);
        if (gatewaySn) state.active.gatewaySn = gatewaySn;
      }
    }

    if (modeCode === undefined) {
      return state.active;
    }

    if (FLIGHT_ACTIVE_MODES.has(modeCode)) {
      state.standbySince = undefined;
      state.disconnectedSince = undefined;

      if (!state.active) {
        const gatewaySn = this.resolveGatewaySn?.(message.deviceId);
        const activity = classifyMissionActivity(modeCode);
        const session: AutoMissionSession = {
          missionId: randomUUID(),
          deviceId: message.deviceId,
          ...(gatewaySn ? { gatewaySn } : {}),
          source: "automatic",
          startedAt: message.receivedAt,
          lastTelemetryAt: message.receivedAt,
          lastModeCode: modeCode,
          ...(activity ? { lastActivity: activity } : {}),
          waylineObserved: modeCode === 5
        };
        state.active = session;
        this.publish({ type: "started", session: { ...session } });
      }

      return state.active;
    }

    if (!state.active) return undefined;

    if (modeCode === 0) {
      state.disconnectedSince = undefined;
      state.standbySince ??= message.receivedAt;

      if (message.receivedAt - state.standbySince >= this.standbyGraceMs) {
        return this.end(message.deviceId, state.standbySince, "standby");
      }
      return state.active;
    }

    if (modeCode === 14) {
      state.standbySince = undefined;
      state.disconnectedSince ??= message.receivedAt;

      if (
        message.receivedAt - state.disconnectedSince >=
        this.disconnectedGraceMs
      ) {
        return this.end(
          message.deviceId,
          state.disconnectedSince,
          "device_disconnected"
        );
      }
      return state.active;
    }

    // Preparation/upgrading/other non-flight states do not create a session and
    // do not immediately tear down an active one. Timeout/standby decides.
    state.standbySince = undefined;
    state.disconnectedSince = undefined;
    return state.active;
  }

  sweep(now = Date.now()): AutoMissionSession[] {
    const ended: AutoMissionSession[] = [];

    for (const [deviceId, state] of this.states) {
      if (!state.active) continue;

      if (now - state.active.lastTelemetryAt >= this.telemetryTimeoutMs) {
        const endedAt = state.active.lastTelemetryAt + this.telemetryTimeoutMs;
        const session = this.end(deviceId, endedAt, "telemetry_timeout");
        if (session) ended.push(session);
      }
    }

    return ended;
  }

  end(
    deviceId: string,
    endedAt = Date.now(),
    reason: MissionEndReason = "manual"
  ): AutoMissionSession | undefined {
    const state = this.states.get(deviceId);
    if (!state?.active) return undefined;

    const completed: AutoMissionSession = {
      ...state.active,
      endedAt,
      endReason: reason
    };

    state.active = undefined;
    state.lastCompleted = completed;
    state.standbySince = undefined;
    state.disconnectedSince = undefined;

    this.publish({ type: "ended", session: { ...completed } });
    return completed;
  }

  getActive(deviceId: string): AutoMissionSession | undefined {
    const session = this.states.get(deviceId)?.active;
    return session ? { ...session } : undefined;
  }

  getLastCompleted(deviceId: string): AutoMissionSession | undefined {
    const session = this.states.get(deviceId)?.lastCompleted;
    return session ? { ...session } : undefined;
  }

  listActive(): AutoMissionSession[] {
    return [...this.states.values()]
      .map((state) => state.active)
      .filter((session): session is AutoMissionSession => Boolean(session))
      .map((session) => ({ ...session }));
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private publish(event: MissionSessionEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}

export function classifyMissionActivity(
  modeCode: number
): MissionActivity | undefined {
  switch (modeCode) {
    case 3:
      return "manual_flight";
    case 4:
      return "automatic_takeoff";
    case 5:
      return "wayline";
    case 6:
      return "panorama";
    case 7:
      return "intelligent_tracking";
    case 8:
      return "adsb_avoidance";
    case 9:
      return "return_to_home";
    case 10:
      return "automatic_landing";
    case 11:
      return "forced_landing";
    case 12:
      return "three_blade_landing";
    case 15:
      return "apas";
    case 16:
      return "virtual_stick";
    case 17:
      return "live_flight_control";
    case 18:
      return "airborne_rtk_fixing";
    default:
      return undefined;
  }
}

export function extractModeCode(payload: unknown): number | undefined {
  if (!isRecord(payload)) return undefined;
  const source = isRecord(payload.data) ? payload.data : payload;
  const host = isRecord(source.host) ? source.host : source;

  return finiteNumber(host.mode_code) ?? finiteNumber(source.mode_code);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
