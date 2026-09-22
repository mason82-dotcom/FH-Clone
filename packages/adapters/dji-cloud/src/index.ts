import { randomUUID } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import type {
  AdapterDevice,
  AdapterEvents,
  AircraftAdapter,
  AircraftCommand,
  Capability,
  CommandResult,
  RawMessage
} from "@fh-clone/aircraft-core";
import { normalizeDjiPayload } from "./normalizer.js";
import { DJI_CLOUD_API_BASELINE } from "./version.js";
import type { DjiServiceReply, DjiServiceRequester } from "./service.js";
import {
  DjiTopologyRegistry,
  describeDjiProduct,
  parseDjiTopologyUpdate
} from "./topology.js";
import {
  getDjiCloudControlProfile,
  type DjiCloudControlProfile,
  type DjiDrcProfile
} from "./capabilities.js";

export interface DjiCloudAdapterOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  topicFilters?: string[];
  serviceTimeoutMs?: number;
  /**
   * Dokumentations-/Kompatibilitätsprofil. Dies ist keine MQTT-Protokollverhandlung.
   * Standard ist die aktuell verifizierte DJI Cloud API Baseline.
   */
  apiVersion?: string;
}

interface PendingServiceRequest {
  method: string;
  timer: NodeJS.Timeout;
  resolve: (reply: DjiServiceReply) => void;
  reject: (error: Error) => void;
}

const DEFAULT_TOPICS = [
  "thing/product/+/osd",
  "thing/product/+/state",
  "thing/product/+/events",
  "thing/product/+/services_reply",
  "sys/product/+/status"
];

function deviceFromTopic(topic: string): string | undefined {
  const parts = topic.split("/");
  if (
    parts.length >= 4 &&
    (parts[0] === "thing" || parts[0] === "sys") &&
    parts[1] === "product"
  ) {
    return parts[2];
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DjiCloudAdapter implements AircraftAdapter, DjiServiceRequester {
  readonly id = "dji-cloud";
  private client?: MqttClient;
  private events?: AdapterEvents;
  private connected = false;
  private readonly devices = new Map<string, AdapterDevice>();
  private readonly capabilities = new Map<string, Set<Capability>>();
  private readonly pendingServices = new Map<string, PendingServiceRequest>();
  readonly topology = new DjiTopologyRegistry();

  constructor(private readonly options: DjiCloudAdapterOptions) {}

  get isConnected(): boolean {
    return this.connected;
  }

  get apiVersion(): string {
    return this.options.apiVersion ?? DJI_CLOUD_API_BASELINE;
  }

  async start(events: AdapterEvents): Promise<void> {
    if (this.client) return;
    this.events = events;

    const client = mqtt.connect(this.options.brokerUrl, {
      protocolVersion: 5,
      clean: false,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000,
      ...(this.options.username ? { username: this.options.username } : {}),
      ...(this.options.password ? { password: this.options.password } : {}),
      ...(this.options.clientId ? { clientId: this.options.clientId } : {})
    });

    this.client = client;

    client.on("connect", () => {
      this.connected = true;
      const filters = this.options.topicFilters ?? DEFAULT_TOPICS;
      client.subscribe(filters, { qos: 1 });
    });

    client.on("close", () => {
      this.connected = false;
    });

    client.on("message", (topic, bytes) => {
      void this.handleMessage(topic, bytes).catch((error: unknown) => {
        console.error("DJI MQTT message processing failed", error);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        client.off("error", onError);
        resolve();
      };
      const onError = (error: Error) => {
        client.off("connect", onConnect);
        reject(error);
      };
      client.once("connect", onConnect);
      client.once("error", onError);
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.connected = false;

    for (const [tid, pending] of this.pendingServices) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`DJI service request ${tid} cancelled because adapter stopped`));
    }
    this.pendingServices.clear();

    if (!client) return;
    await new Promise<void>((resolve) => {
      client.end(false, {}, resolve);
    });
  }

  async listDevices(): Promise<AdapterDevice[]> {
    return [...this.devices.values()];
  }

  resolveGatewaySn(deviceOrGatewaySn: string): string | undefined {
    return this.topology.resolveGatewaySn(deviceOrGatewaySn);
  }

  getControlProfile(deviceSn: string): DjiCloudControlProfile | undefined {
    const gatewaySn = this.resolveGatewaySn(deviceSn);
    if (!gatewaySn) return undefined;
    const topology = this.topology.getGateway(gatewaySn);
    const subDevice = topology?.subDevices.find((device) => device.sn === deviceSn);
    if (!topology || !subDevice) return undefined;
    return getDjiCloudControlProfile(subDevice.product, topology.product);
  }

  getDrcProfile(deviceSn: string): DjiDrcProfile {
    return this.getControlProfile(deviceSn)?.drcProfile ?? "none";
  }

  supportsFlightControl(deviceSn: string): boolean {
    return this.getControlProfile(deviceSn)?.flightControl ?? false;
  }

  supportsFlyTo(deviceSn: string): boolean {
    return this.getControlProfile(deviceSn)?.flyTo ?? false;
  }

  supportsPointingFlight(deviceSn: string): boolean {
    return this.getControlProfile(deviceSn)?.pointingFlight ?? false;
  }

  supportsOrbitFlight(deviceSn: string): boolean {
    return this.getControlProfile(deviceSn)?.orbitFlight ?? false;
  }

  async requestServiceForDevice(
    deviceSn: string,
    method: string,
    data: unknown,
    timeoutMs = this.options.serviceTimeoutMs ?? 10_000
  ): Promise<DjiServiceReply> {
    const gatewaySn = this.resolveGatewaySn(deviceSn);
    if (!gatewaySn) {
      throw new Error(`No DJI gateway is known for device ${deviceSn}`);
    }
    return this.requestService(gatewaySn, method, data, timeoutMs);
  }

  async requestService(
    gatewaySn: string,
    method: string,
    data: unknown,
    timeoutMs = this.options.serviceTimeoutMs ?? 10_000
  ): Promise<DjiServiceReply> {
    const client = this.client;
    if (!client || !this.connected) {
      throw new Error("DJI Cloud MQTT adapter is not connected");
    }

    const tid = randomUUID();
    const bid = randomUUID();
    const envelope = {
      tid,
      bid,
      timestamp: Date.now(),
      method,
      data
    };

    return new Promise<DjiServiceReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingServices.delete(tid);
        reject(new Error(`DJI service ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      this.pendingServices.set(tid, { method, timer, resolve, reject });

      client.publish(
        `thing/product/${gatewaySn}/services`,
        JSON.stringify(envelope),
        { qos: 1 },
        (error?: Error) => {
          if (!error) return;
          clearTimeout(timer);
          this.pendingServices.delete(tid);
          reject(error);
        }
      );
    });
  }

  async execute(_command: AircraftCommand): Promise<CommandResult> {
    return {
      ok: false,
      code: "disabled",
      message:
        "Direct DJI flight-control publishing remains disabled in the adapter; use the backend CommandCoordinator/DRC service."
    };
  }

  private async handleMessage(topic: string, bytes: Buffer): Promise<void> {
    const receivedAt = Date.now();
    let payload: unknown;

    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch {
      payload = { raw: bytes.toString("utf8"), parseError: true };
    }

    if (topic.endsWith("/services_reply")) {
      this.resolveServiceReply(payload);
    }

    const deviceId = deviceFromTopic(topic);

    if (deviceId && topic.startsWith("sys/product/") && topic.endsWith("/status")) {
      const topology = parseDjiTopologyUpdate(deviceId, payload, receivedAt);
      if (topology) {
        await this.applyTopology(topology, payload);
      }
    }
    const raw: RawMessage = {
      adapterId: this.id,
      ...(deviceId ? { deviceId } : {}),
      receivedAt,
      channel: topic,
      payload
    };
    await this.events?.onRawMessage?.(raw);

    if (!deviceId) return;

    if (!topic.endsWith("/osd") && !topic.endsWith("/state")) return;

    const normalized = normalizeDjiPayload(deviceId, payload, receivedAt);
    const knownCapabilities = this.capabilities.get(deviceId) ?? new Set<Capability>();
    for (const capability of normalized.capabilities) knownCapabilities.add(capability);
    this.capabilities.set(deviceId, knownCapabilities);

    const device: AdapterDevice = {
      identity: {
        id: deviceId,
        serialNumber: deviceId,
        vendor: "DJI"
      },
      adapterId: this.id,
      capabilities: [...knownCapabilities],
      connected: true,
      lastSeenAt: receivedAt
    };

    this.devices.set(deviceId, device);
    await this.events?.onDevice?.(device);

    for (const sample of normalized.samples) {
      await this.events?.onParameter?.(sample);
    }
  }

  private async applyTopology(
    topology: ReturnType<typeof parseDjiTopologyUpdate> extends infer T
      ? Exclude<T, undefined>
      : never,
    payload: unknown
  ): Promise<void> {
    const change = this.topology.apply(topology);

    const gateway: AdapterDevice = {
      identity: {
        id: topology.gatewaySn,
        serialNumber: topology.gatewaySn,
        vendor: "DJI",
        model: describeDjiProduct(topology.product),
        productType: `${topology.product.domain ?? "?"}-${topology.product.type}-${topology.product.subType}`
      },
      adapterId: this.id,
      capabilities: [],
      connected: true,
      lastSeenAt: topology.updatedAt
    };
    this.devices.set(topology.gatewaySn, gateway);
    await this.events?.onDevice?.(gateway);

    for (const subDevice of topology.subDevices) {
      const existing = this.devices.get(subDevice.sn);
      const device: AdapterDevice = {
        identity: {
          id: subDevice.sn,
          serialNumber: subDevice.sn,
          vendor: "DJI",
          model: describeDjiProduct(subDevice.product),
          productType: `${subDevice.product.domain ?? "?"}-${subDevice.product.type}-${subDevice.product.subType}`
        },
        adapterId: this.id,
        capabilities: [
          ...(existing?.capabilities ?? []),
          ...getDjiCloudControlProfile(subDevice.product, topology.product).capabilities
        ].filter((value, index, values) => values.indexOf(value) === index),
        connected: true,
        lastSeenAt: topology.updatedAt
      };
      this.devices.set(subDevice.sn, device);
      await this.events?.onDevice?.(device);
    }

    for (const removed of change.removedSubDevices) {
      const existing = this.devices.get(removed.sn);
      if (!existing) continue;
      const offline: AdapterDevice = {
        ...existing,
        connected: false,
        lastSeenAt: topology.updatedAt
      };
      this.devices.set(removed.sn, offline);
      await this.events?.onDevice?.(offline);
    }

    await this.replyToTopologyUpdate(topology.gatewaySn, payload);
  }

  private async replyToTopologyUpdate(gatewaySn: string, payload: unknown): Promise<void> {
    const client = this.client;
    if (!client || !isRecord(payload) || typeof payload.tid !== "string") return;

    const reply = {
      tid: payload.tid,
      ...(typeof payload.bid === "string" ? { bid: payload.bid } : {}),
      timestamp: Date.now(),
      method: "update_topo",
      data: { result: 0 }
    };

    await new Promise<void>((resolve, reject) => {
      client.publish(
        `sys/product/${gatewaySn}/status_reply`,
        JSON.stringify(reply),
        { qos: 1 },
        (error?: Error) => error ? reject(error) : resolve()
      );
    });
  }

  private resolveServiceReply(payload: unknown): void {
    if (!isRecord(payload) || typeof payload.tid !== "string") return;
    if (!isRecord(payload.data) || typeof payload.data.result !== "number") return;

    const pending = this.pendingServices.get(payload.tid);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingServices.delete(payload.tid);

    const reply: DjiServiceReply = {
      tid: payload.tid,
      result: payload.data.result,
      data: payload.data,
      ...(typeof payload.bid === "string" ? { bid: payload.bid } : {}),
      ...(typeof payload.method === "string" ? { method: payload.method } : {})
    };

    if (reply.method && reply.method !== pending.method) {
      pending.reject(
        new Error(
          `DJI service reply method mismatch: expected ${pending.method}, received ${reply.method}`
        )
      );
      return;
    }

    pending.resolve(reply);
  }
}

export { normalizeDjiPayload } from "./normalizer.js";
export * from "./version.js";
export * from "./service.js";
export * from "./drc.js";
export * from "./topology.js";
export * from "./capabilities.js";
export * from "./rtk.js";
