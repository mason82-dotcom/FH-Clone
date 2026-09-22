import type { ServerResponse } from "node:http";
import type { RawMessage } from "@fh-clone/aircraft-core";
import {
  parseDjiRtkStatus,
  RtkFixMonitor,
  type DjiRtkStatus,
  type RtkFixTransition
} from "@fh-clone/adapter-dji-cloud";

export interface RtkDeviceSnapshot extends DjiRtkStatus {
  deviceId: string;
  gatewaySn?: string;
  missionId?: string;
  stale: boolean;
  ageMs: number;
}

export type RtkLiveEvent =
  | {
      type: "status";
      deviceId: string;
      gatewaySn?: string;
      missionId?: string;
      status: DjiRtkStatus;
    }
  | {
      type: "fix-transition";
      deviceId: string;
      gatewaySn?: string;
      missionId?: string;
      transition: RtkFixTransition;
    };

export interface RtkTelemetryServiceOptions {
  staleAfterMs?: number;
  maxTransitions?: number;
  resolveGatewaySn?: (deviceId: string) => string | undefined;
  resolveMissionId?: (deviceId: string) => string | undefined;
}

type Subscriber = (event: RtkLiveEvent) => void;

export class RtkTelemetryService {
  private readonly latest = new Map<string, DjiRtkStatus>();
  private readonly monitor = new RtkFixMonitor();
  private readonly transitions: RtkFixTransition[] = [];
  private readonly subscribers = new Set<Subscriber>();

  private readonly staleAfterMs: number;
  private readonly maxTransitions: number;
  private readonly resolveGatewaySn: ((deviceId: string) => string | undefined) | undefined;
  private readonly resolveMissionId: ((deviceId: string) => string | undefined) | undefined;

  constructor(options: RtkTelemetryServiceOptions = {}) {
    this.staleAfterMs = options.staleAfterMs ?? 5_000;
    this.maxTransitions = options.maxTransitions ?? 200;
    this.resolveGatewaySn = options.resolveGatewaySn;
    this.resolveMissionId = options.resolveMissionId;
  }

  observe(message: RawMessage): void {
    if (!message.deviceId) return;
    if (!message.channel.endsWith("/osd") && !message.channel.endsWith("/state")) {
      return;
    }

    const status = parseDjiRtkStatus(message.payload, message.receivedAt);
    if (!status) return;

    const deviceId = message.deviceId;
    const gatewaySn = this.resolveGatewaySn?.(deviceId);
    const missionId = this.resolveMissionId?.(deviceId);
    this.latest.set(deviceId, status);

    this.publish({
      type: "status",
      deviceId,
      ...(gatewaySn ? { gatewaySn } : {}),
      ...(missionId ? { missionId } : {}),
      status
    });

    const transition = this.monitor.observe(deviceId, status);
    if (!transition) return;

    this.transitions.push(transition);
    if (this.transitions.length > this.maxTransitions) {
      this.transitions.splice(0, this.transitions.length - this.maxTransitions);
    }

    this.publish({
      type: "fix-transition",
      deviceId,
      ...(gatewaySn ? { gatewaySn } : {}),
      ...(missionId ? { missionId } : {}),
      transition
    });
  }

  get(deviceId: string, now = Date.now()): RtkDeviceSnapshot | undefined {
    const status = this.latest.get(deviceId);
    if (!status) return undefined;

    const ageMs = Math.max(0, now - status.sampledAt);
    const gatewaySn = this.resolveGatewaySn?.(deviceId);
    const missionId = this.resolveMissionId?.(deviceId);

    return {
      deviceId,
      ...(gatewaySn ? { gatewaySn } : {}),
      ...(missionId ? { missionId } : {}),
      ...status,
      stale: ageMs > this.staleAfterMs,
      ageMs
    };
  }

  list(now = Date.now()): RtkDeviceSnapshot[] {
    return [...this.latest.keys()]
      .map((deviceId) => this.get(deviceId, now))
      .filter((value): value is RtkDeviceSnapshot => Boolean(value))
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  }

  recentTransitions(deviceId?: string): RtkFixTransition[] {
    return this.transitions.filter(
      (transition) => !deviceId || transition.deviceId === deviceId
    );
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  openEventStream(response: ServerResponse, deviceId?: string): void {
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.setHeader("x-accel-buffering", "no");
    response.flushHeaders();

    response.write("retry: 3000\n\n");
    writeSse(response, "snapshot", deviceId ? this.get(deviceId) : this.list());

    const unsubscribe = this.subscribe((event) => {
      if (deviceId && event.deviceId !== deviceId) return;
      writeSse(
        response,
        event.type === "fix-transition" ? "rtk-fix-transition" : "rtk-status",
        event
      );
    });

    const keepAlive = setInterval(() => {
      response.write(": keepalive\n\n");
    }, 15_000);

    response.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  }

  private publish(event: RtkLiveEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}

function writeSse(response: ServerResponse, event: string, payload: unknown): void {
  response.write("event: " + event + "\n");
  response.write("data: " + JSON.stringify(payload) + "\n\n");
}
