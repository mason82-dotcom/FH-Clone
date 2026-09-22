import { randomUUID } from "node:crypto";

export type MqttQos = 0 | 1;

export interface DjiMqttPublisher {
  publish(topic: string, payload: unknown, qos: MqttQos): Promise<void>;
}

export interface DrcAxes {
  /** DJI protocol axis x. Semantics vary by product generation; do not map to UI pitch/roll here. */
  x: number;
  /** DJI protocol axis y. Semantics vary by product generation; do not map to UI pitch/roll here. */
  y: number;
  /** Vertical speed in m/s. */
  h: number;
  /** Yaw angular velocity. Current Dock documentation uses degree/s. */
  w: number;
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
  tid: string;
  bid: string;
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

interface ServiceEnvelope {
  tid: string;
  bid: string;
  timestamp: number;
  method: string;
  data: unknown;
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
  private lastAxes?: DrcAxes;

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
  private envelopeSeq = 0;
  private queue: Promise<void> = Promise.resolve();
  private lastControlAt = 0;
  private controlBlockedUntil = 0;
  private heartbeatTimer?: NodeJS.Timeout;

  private readonly envelopeProfile: DrcEnvelopeProfile;
  private readonly minControlIntervalMs: number;
  private readonly postEmergencyStopCooldownMs: number;
  private readonly heartbeatIntervalMs: number;

  constructor(
    private readonly mqtt: DjiMqttPublisher,
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

  async grabFlightAuthority(gatewaySn: string): Promise<{ tid: string; bid: string }> {
    return this.publishService(gatewaySn, "flight_authority_grab", {});
  }

  async enterDrcMode(
    gatewaySn: string,
    options: EnterDrcModeOptions
  ): Promise<{ tid: string; bid: string }> {
    const osd = options.osdFrequencyHz ?? 10;
    const hsi = options.hsiFrequencyHz ?? 1;
    assertFiniteRange("osdFrequencyHz", osd, 1, 30);
    assertFiniteRange("hsiFrequencyHz", hsi, 1, 30);

    return this.publishService(gatewaySn, "drc_mode_enter", {
      mqtt_broker: options.mqttBroker,
      osd_frequency: osd,
      hsi_frequency: hsi
    });
  }

  async exitDrcMode(gatewaySn: string): Promise<{ tid: string; bid: string }> {
    this.stopHeartbeat();
    return this.publishService(gatewaySn, "drc_mode_exit", {});
  }

  async sendControl(gatewaySn: string, axes: DrcAxes): Promise<number> {
    assertFiniteRange("x", axes.x, -17, 17);
    assertFiniteRange("y", axes.y, -17, 17);
    assertFiniteRange("h", axes.h, -4, 5);
    assertFiniteRange("w", axes.w, -90, 90);

    return this.runExclusive(async () => {
      const now = Date.now();
      const earliest = Math.max(
        this.controlBlockedUntil,
        this.lastControlAt + this.minControlIntervalMs
      );
      if (earliest > now) {
        await new Promise<void>((resolve) => setTimeout(resolve, earliest - now));
      }

      const seq = this.controlSequence.next(axes);
      await this.mqtt.publish(
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

  async emergencyStop(gatewaySn: string): Promise<number | undefined> {
    return this.runExclusive(async () => {
      const seq = this.envelopeProfile === "modern" ? this.nextEnvelopeSeq() : undefined;
      const payload =
        seq === undefined
          ? { method: "drone_emergency_stop", data: {} }
          : { method: "drone_emergency_stop", data: {}, seq };

      await this.mqtt.publish(
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

      await this.mqtt.publish(
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
    const ids = await this.publishService(gatewaySn, "fly_to_point", {
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

    return { flyToId, ...ids };
  }

  private async publishService(
    gatewaySn: string,
    method: string,
    data: unknown
  ): Promise<{ tid: string; bid: string }> {
    const envelope: ServiceEnvelope = {
      tid: randomUUID(),
      bid: randomUUID(),
      timestamp: Date.now(),
      method,
      data
    };

    await this.mqtt.publish(
      `thing/product/${gatewaySn}/services`,
      envelope,
      1
    );

    return { tid: envelope.tid, bid: envelope.bid };
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
