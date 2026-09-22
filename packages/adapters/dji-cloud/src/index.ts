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

export interface DjiCloudAdapterOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  topicFilters?: string[];
  /**
   * Dokumentations-/Kompatibilitätsprofil. Dies ist keine MQTT-Protokollverhandlung.
   * Standard ist die aktuell verifizierte DJI Cloud API Baseline.
   */
  apiVersion?: string;
}

const DEFAULT_TOPICS = [
  "thing/product/+/osd",
  "thing/product/+/state",
  "thing/product/+/events",
  "thing/product/+/services_reply",
  "thing/product/+/drc/up",
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

export class DjiCloudAdapter implements AircraftAdapter {
  readonly id = "dji-cloud";
  private client?: MqttClient;
  private events?: AdapterEvents;
  private connected = false;
  private readonly devices = new Map<string, AdapterDevice>();
  private readonly capabilities = new Map<string, Set<Capability>>();

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
    if (!client) return;

    await new Promise<void>((resolve) => {
      client.end(false, {}, resolve);
    });
  }

  async listDevices(): Promise<AdapterDevice[]> {
    return [...this.devices.values()];
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

    const deviceId = deviceFromTopic(topic);
    const raw: RawMessage = {
      adapterId: this.id,
      ...(deviceId ? { deviceId } : {}),
      receivedAt,
      channel: topic,
      payload
    };
    await this.events?.onRawMessage?.(raw);

    if (!deviceId) return;

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
}

export { normalizeDjiPayload } from "./normalizer.js";
export * from "./version.js";
export * from "./drc.js";
