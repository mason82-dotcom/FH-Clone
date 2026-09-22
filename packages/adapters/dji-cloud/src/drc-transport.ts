import mqtt, { type MqttClient } from "mqtt";
import type { DjiMqttPublisher, DrcBrokerCredentials, MqttQos } from "./drc.js";

export type DrcTransportLossReason = "mqtt_close" | "mqtt_offline";

export interface DrcTransportContext {
  gatewaySn: string;
  aircraftSn: string;
}

export interface DrcInboundMessage extends DrcTransportContext {
  topic: string;
  payload: unknown;
  receivedAt: number;
}

export interface DrcBrokerTransportOptions {
  onConnected?: () => void | Promise<void>;
  onLost?: (reason: DrcTransportLossReason) => void | Promise<void>;
  onMessage?: (message: DrcInboundMessage) => void | Promise<void>;
}

const SAFE_TOPIC_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Dedicated DJI DRC data-plane MQTT transport.
 *
 * Credentials remain process-local and are never persisted or logged here.
 * A disconnected transport is fail-closed: publish() rejects until MQTT
 * reports a successful connect event.
 *
 * The upstream subscription is bound to exactly one active gateway. No
 * wildcard DRC subscription is used.
 */
export class DrcBrokerTransport implements DjiMqttPublisher {
  private client?: MqttClient;
  private connected = false;
  private generation = 0;

  constructor(private readonly options: DrcBrokerTransportOptions = {}) {}

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(
    credentials: DrcBrokerCredentials,
    context: DrcTransportContext
  ): Promise<void> {
    if (
      !SAFE_TOPIC_ID.test(context.gatewaySn) ||
      !SAFE_TOPIC_ID.test(context.aircraftSn)
    ) {
      throw new Error("invalid_drc_transport_identity");
    }

    await this.disconnect();
    const generation = ++this.generation;
    const topic = `thing/product/${context.gatewaySn}/drc/up`;
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
      void this.options.onLost?.(reason);
    };
    client.on("close", () => lose("mqtt_close"));
    client.on("offline", () => lose("mqtt_offline"));
    client.on("error", () => {
      // After connect, MQTT errors are diagnostic; close/offline are the
      // authoritative transport-loss signals. Initial errors reject below.
    });
    client.on("message", (receivedTopic, bytes) => {
      if (
        generation !== this.generation ||
        receivedTopic !== topic
      ) {
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(bytes.toString("utf8"));
      } catch {
        return;
      }

      void this.options.onMessage?.({
        ...context,
        topic: receivedTopic,
        payload,
        receivedAt: Date.now()
      });
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        client.off("connect", onConnect);
        client.off("error", onError);
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (generation === this.generation) {
          this.connected = false;
          this.client = undefined;
          client.removeAllListeners();
          client.end(true);
        }
        reject(error);
      };

      const onConnect = () => {
        client.subscribe(topic, { qos: 0 }, (error?: Error) => {
          if (error) return fail(error);
          if (settled) return;
          if (generation !== this.generation) {
            return fail(new Error("DRC transport superseded"));
          }
          settled = true;
          cleanup();
          this.connected = true;
          void this.options.onConnected?.();
          resolve();
        });
      };

      const onError = (error: Error) => fail(error);

      client.once("connect", onConnect);
      client.once("error", onError);
    });
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.connected = false;
    ++this.generation;
    if (!client) return;
    client.removeAllListeners();
    await new Promise<void>((resolve) => client.end(false, {}, resolve));
  }

  async publish(topic: string, payload: unknown, qos: MqttQos): Promise<void> {
    const client = this.client;
    if (!client || !this.connected) {
      throw new Error("DJI DRC MQTT transport is not connected");
    }
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, JSON.stringify(payload), { qos }, (error?: Error) =>
        error ? reject(error) : resolve()
      );
    });
  }
}
