import mqtt, { type MqttClient } from "mqtt";
import type { DjiMqttPublisher, DrcBrokerCredentials, MqttQos } from "./drc.js";

export type DrcTransportLossReason = "mqtt_close" | "mqtt_offline";

export interface DrcBrokerTransportOptions {
  onConnected?: () => void | Promise<void>;
  onLost?: (reason: DrcTransportLossReason) => void | Promise<void>;
}

/**
 * Dedicated DJI DRC data-plane MQTT transport.
 *
 * Credentials remain process-local and are never persisted or logged here.
 * A disconnected transport is fail-closed: publish() rejects until MQTT
 * reports a successful connect event.
 */
export class DrcBrokerTransport implements DjiMqttPublisher {
  private client: MqttClient | undefined;
  private connected = false;
  private generation = 0;

  constructor(private readonly options: DrcBrokerTransportOptions = {}) {}

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(credentials: DrcBrokerCredentials): Promise<void> {
    await this.disconnect();
    const generation = ++this.generation;
    const client = mqtt.connect(credentials.address, {
      protocolVersion: 5,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      clientId: credentials.client_id,
      username: credentials.username,
      password: credentials.password,
      ...(credentials.enable_tls ? { rejectUnauthorized: true } : {})
    });
    this.client = client;

    const lose = (reason: DrcTransportLossReason) => {
      if (generation !== this.generation) return;
      this.connected = false;
      this.invokeHook(
        () => this.options.onLost?.(reason),
        "onLost"
      );
    };
    client.on("close", () => lose("mqtt_close"));
    client.on("offline", () => lose("mqtt_offline"));
    client.on("error", () => {
      // After connect, MQTT errors are diagnostic; close/offline are the
      // authoritative transport-loss signals. Initial errors still reject below.
    });

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        if (generation !== this.generation) return reject(new Error("DRC transport superseded"));
        this.connected = true;
        this.invokeHook(
          () => this.options.onConnected?.(),
          "onConnected"
        );
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        if (generation === this.generation) {
          this.connected = false;
          this.client = undefined;
          client.removeAllListeners();
          client.end(true);
        }
        reject(error);
      };
      const cleanup = () => {
        client.off("connect", onConnect);
        client.off("error", onError);
      };
      client.once("connect", onConnect);
      client.once("error", onError);
    });
  }

  private invokeHook(
    hook: () => void | Promise<void> | undefined,
    name: string
  ): void {
    void Promise.resolve()
      .then(hook)
      .catch((error: unknown) => {
        console.error(
          `DJI DRC transport ${name} callback failed`,
          error instanceof Error ? error.message : String(error)
        );
      });
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.connected = false;
    ++this.generation;
    if (!client) return;
    client.removeAllListeners();
    await new Promise<void>((resolve, reject) => {
      client.end(false, {}, (error?: Error) =>
        error ? reject(error) : resolve()
      );
    });
  }

  async publish(topic: string, payload: unknown, qos: MqttQos): Promise<void> {
    const client = this.client;
    if (!client || !this.connected) throw new Error("DJI DRC MQTT transport is not connected");
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify(payload), { qos }, (error?: Error) =>
        error ? reject(error) : resolve()
      );
    });
  }
}
