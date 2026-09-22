import { randomUUID } from "node:crypto";
import type { DjiServiceReply, DjiServiceRequester } from "./service.js";
import { DjiServiceError } from "./service.js";

export type MqttQos = 0 | 1;

export interface DjiMqttPublisher {
  publish(topic: string, payload: unknown, qos: MqttQos): Promise<void>;
}

export interface DrcAxes {
  /** Legacy DJI velocity-control axis x. */
  x: number;
  /** Legacy DJI velocity-control axis y. */
  y: number;
  /** Vertical speed in m/s. */
  h: number;
  /** Yaw angular velocity in degree/s. */
  w: number;
}

export const DJI_STICK_MIN = 364;
export const DJI_STICK_CENTER = 1024;
export const DJI_STICK_MAX = 1684;

export interface DrcStickChannels {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
  /** Optional gimbal pitch channel for products that expose it on stick_control. */
  gimbalPitch?: number;
}

export interface NormalizedStickInput {
  /** Normalized input -1..1. */
  roll: number;
  /** Normalized input -1..1. */
  pitch: number;
  /** Normalized input -1..1. */
  throttle: number;
  /** Normalized input -1..1. */
  yaw: number;
}

export function toDjiStickChannel(value: number): number {
  assertFiniteRange("normalized stick input", value, -1, 1);
  return Math.round(DJI_STICK_CENTER + value * (DJI_STICK_MAX - DJI_STICK_CENTER));
}

export function toDjiStickChannels(input: NormalizedStickInput): DrcStickChannels {
  return {
    roll: toDjiStickChannel(input.roll),
    pitch: toDjiStickChannel(input.pitch),
    throttle: toDjiStickChannel(input.throttle),
    yaw: toDjiStickChannel(input.yaw)
  };
}

export interface DrcBrokerCredentials {
  address: string;
  client_id: string;
  username: string;
  password: string;
  expire_time: number;
  enable_tls: boolean;
}

export interface EnterDrcModeOptions {
  mqttBroker: DrcBrokerCredentials;
  osdFrequencyHz?: number;
  hsiFrequencyHz?: number;
}

export interface FlyToPoint {
  latitude: number;
  longitude: number;
  /** Ellipsoid height in meters according to the Cloud API FlyTo contract. */
  height: number;
}

export interface FlyToRequest {
  point: FlyToPoint;
  maxSpeedMps?: number;
}

export interface FlyToHandle {
  flyToId: string;
  reply: DjiServiceReply;
}

export interface FlyToProgress {
  flyToId: string;
  status: "wayline_progress" | "wayline_ok" | "wayline_cancel" | "wayline_failed" | string;
  result: number;
  waypointIndex: number;
  remainingDistanceM: number;
  remainingTimeS: number;
}

export type DrcEnvelopeProfile = "modern" | "legacy";

export interface DrcControllerOptions {
  /**
   * modern: current RC/Dock APIs use envelope-level seq for heartbeat and
   * emergency-style DRC commands. legacy keeps heartbeat seq inside data and
   * omits envelope seq for emergency stop.
   */
  envelopeProfile?: DrcEnvelopeProfile;
  /** Maximum command rate is 10 Hz by default. */
  minControlIntervalMs?: number;
  /**
   * Local FH-Clone safety policy after emergency stop.
   * This is deliberately configurable and is not treated as a Cloud API protocol constant.
   */
  postEmergencyStopCooldownMs?: number;
  /** Heartbeat period. DJI exits an idle DRC link after prolonged heartbeat absence. */
  heartbeatIntervalMs?: number;
}

function assertFiniteRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}`);
  }
}

function sameAxes(a: DrcAxes, b: DrcAxes): boolean {
  return a.x === b.x && a.y === b.y && a.h === b.h && a.w === b.w;
}

class DrcControlSequence {
  private seq = -1;
  private lastAxes: DrcAxes | undefined;

  next(axes: DrcAxes): number {
    if (!this.lastAxes || !sameAxes(this.lastAxes, axes)) {
      this.seq = 0;
    } else {
      this.seq += 1;
    }
    this.lastAxes = { ...axes };
    return this.seq;
  }

  reset(): void {
    this.seq = -1;
    this.lastAxes = undefined;
  }
}

export class DrcController {
  private readonly controlSequence = new DrcControlSequence();
  private stickSeq = 0;
  private envelopeSeq = 0;
  private queue: Promise<void> = Promise.resolve();
  private lastControlAt = 0;
  private controlBlockedUntil = 0;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  private readonly envelopeProfile: DrcEnvelopeProfile;
  private readonly minControlIntervalMs: number;
  private readonly postEmergencyStopCooldownMs: number;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly services: DjiServiceRequester,
    private readonly drc: DjiMqttPublisher,
    options: DrcControllerOptions = {}
  ) {
    this.envelopeProfile = options.envelopeProfile ?? "modern";
    this.minControlIntervalMs = options.minControlIntervalMs ?? 100;
    this.postEmergencyStopCooldownMs = options.postEmergencyStopCooldownMs ?? 2_200;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
  }

  resetControlSequence(): void {
    this.controlSequence.reset();
  }

  async grabFlightAuthority(gatewaySn: string): Promise<DjiServiceReply> {
    return this.requestServiceOk(gatewaySn, "flight_authority_grab", {});
  }

  async enterDrcMode(
    gatewaySn: string,
    options: EnterDrcModeOptions
  ): Promise<DjiServiceReply> {
    const osd = options.osdFrequencyHz ?? 10;
    const hsi = options.hsiFrequencyHz ?? 1;
    assertFiniteRange("osdFrequencyHz", osd, 1, 30);
    assertFiniteRange("hsiFrequencyHz", hsi, 1, 30);

    return this.requestServiceOk(gatewaySn, "drc_mode_enter", {
      mqtt_broker: options.mqttBroker,
      osd_frequency: osd,
      hsi_frequency: hsi
    });
  }

  async exitDrcMode(gatewaySn: string): Promise<DjiServiceReply> {
    this.stopHeartbeat();
    return this.requestServiceOk(gatewaySn, "drc_mode_exit", {});
  }

  /**
   * Legacy velocity-control command. DJI marks drone_control as abandoned in
   * current DRC documentation; keep it only for integrations that explicitly
   * require the legacy profile.
   */
  async sendControl(gatewaySn: string, axes: DrcAxes): Promise<number> {
    assertFiniteRange("x", axes.x, -17, 17);
    assertFiniteRange("y", axes.y, -17, 17);
    assertFiniteRange("h", axes.h, -4, 5);
    assertFiniteRange("w", axes.w, -90, 90);

    return this.runExclusive(async () => {
      await this.waitForControlSlot();

      const seq = this.controlSequence.next(axes);
      await this.drc.publish(
        `thing/product/${gatewaySn}/drc/down`,
        {
          method: "drone_control",
          data: {
            seq,
            x: axes.x,
            y: axes.y,
            h: axes.h,
            w: axes.w
          }
        },
        0
      );
      this.lastControlAt = Date.now();
      return seq;
    });
  }

  /**
   * Current Pilot/Dock stick-control protocol. Callers must maintain a 5-10 Hz
   * stream while active. The protocol intentionally has no ACK mechanism.
   */
  async sendStickControl(
    gatewaySn: string,
    channels: DrcStickChannels
  ): Promise<number> {
    assertFiniteRange("roll", channels.roll, DJI_STICK_MIN, DJI_STICK_MAX);
    assertFiniteRange("pitch", channels.pitch, DJI_STICK_MIN, DJI_STICK_MAX);
    assertFiniteRange("throttle", channels.throttle, DJI_STICK_MIN, DJI_STICK_MAX);
    assertFiniteRange("yaw", channels.yaw, DJI_STICK_MIN, DJI_STICK_MAX);
    if (channels.gimbalPitch !== undefined) {
      assertFiniteRange(
        "gimbalPitch",
        channels.gimbalPitch,
        DJI_STICK_MIN,
        DJI_STICK_MAX
      );
    }

    return this.runExclusive(async () => {
      await this.waitForControlSlot();

      const seq = ++this.stickSeq;
      await this.drc.publish(
        `thing/product/${gatewaySn}/drc/down`,
        {
          seq,
          method: "stick_control",
          data: {
            roll: Math.round(channels.roll),
            pitch: Math.round(channels.pitch),
            throttle: Math.round(channels.throttle),
            yaw: Math.round(channels.yaw),
            ...(channels.gimbalPitch !== undefined
              ? { gimbal_pitch: Math.round(channels.gimbalPitch) }
              : {})
          }
        },
        0
      );
      this.lastControlAt = Date.now();
      return seq;
    });
  }

  async sendNeutralStickControl(gatewaySn: string): Promise<number> {
    return this.sendStickControl(gatewaySn, {
      roll: DJI_STICK_CENTER,
      pitch: DJI_STICK_CENTER,
      throttle: DJI_STICK_CENTER,
      yaw: DJI_STICK_CENTER
    });
  }

  async emergencyStop(gatewaySn: string): Promise<number | undefined> {
    return this.runExclusive(async () => {
      const seq = this.envelopeProfile === "modern" ? this.nextEnvelopeSeq() : undefined;
      const payload =
        seq === undefined
          ? { method: "drone_emergency_stop", data: {} }
          : { method: "drone_emergency_stop", data: {}, seq };

      await this.drc.publish(
        `thing/product/${gatewaySn}/drc/down`,
        payload,
        1
      );

      this.controlBlockedUntil = Date.now() + this.postEmergencyStopCooldownMs;
      return seq;
    });
  }

  async sendHeartbeat(gatewaySn: string): Promise<number> {
    return this.runExclusive(async () => {
      const seq = this.nextEnvelopeSeq();
      const payload =
        this.envelopeProfile === "modern"
          ? {
              method: "heart_beat",
              seq,
              data: { timestamp: Date.now() }
            }
          : {
              method: "heart_beat",
              data: { seq, timestamp: Date.now() }
            };

      await this.drc.publish(
        `thing/product/${gatewaySn}/drc/down`,
        payload,
        0
      );
      return seq;
    });
  }

  startHeartbeat(gatewaySn: string): void {
    this.stopHeartbeat();
    void this.sendHeartbeat(gatewaySn);
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat(gatewaySn);
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  async flyToPoint(gatewaySn: string, request: FlyToRequest): Promise<FlyToHandle> {
    assertFiniteRange("latitude", request.point.latitude, -90, 90);
    assertFiniteRange("longitude", request.point.longitude, -180, 180);
    assertFiniteRange("height", request.point.height, 2, 10_000);
    if (request.maxSpeedMps !== undefined) {
      assertFiniteRange("maxSpeedMps", request.maxSpeedMps, 0, 15);
    }

    const flyToId = randomUUID();
    const reply = await this.requestServiceOk(gatewaySn, "fly_to_point", {
      fly_to_id: flyToId,
      ...(request.maxSpeedMps !== undefined ? { max_speed: request.maxSpeedMps } : {}),
      points: [
        {
          latitude: request.point.latitude,
          longitude: request.point.longitude,
          height: request.point.height
        }
      ]
    });

    return { flyToId, reply };
  }

  private async requestServiceOk(
    gatewaySn: string,
    method: string,
    data: unknown
  ): Promise<DjiServiceReply> {
    const reply = await this.services.requestService(gatewaySn, method, data);
    if (reply.result !== 0) {
      throw new DjiServiceError(method, reply.result, reply);
    }
    return reply;
  }

  private async waitForControlSlot(): Promise<void> {
    const now = Date.now();
    const earliest = Math.max(
      this.controlBlockedUntil,
      this.lastControlAt + this.minControlIntervalMs
    );
    if (earliest > now) {
      await new Promise<void>((resolve) => setTimeout(resolve, earliest - now));
    }
  }

  private nextEnvelopeSeq(): number {
    this.envelopeSeq += 1;
    return this.envelopeSeq;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFlyToProgress(message: unknown): FlyToProgress | undefined {
  if (!isRecord(message) || message.method !== "fly_to_point_progress") return undefined;
  if (!isRecord(message.data)) return undefined;

  const data = message.data;
  if (
    typeof data.fly_to_id !== "string" ||
    typeof data.status !== "string" ||
    typeof data.result !== "number" ||
    typeof data.way_point_index !== "number" ||
    typeof data.remaining_distance !== "number" ||
    typeof data.remaining_time !== "number"
  ) {
    return undefined;
  }

  return {
    flyToId: data.fly_to_id,
    status: data.status,
    result: data.result,
    waypointIndex: data.way_point_index,
    remainingDistanceM: data.remaining_distance,
    remainingTimeS: data.remaining_time
  };
}
