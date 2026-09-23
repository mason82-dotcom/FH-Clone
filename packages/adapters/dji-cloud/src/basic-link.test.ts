import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { MqttClient } from "mqtt";
import type { AdapterDevice } from "@fh-clone/aircraft-core";

import {
  DEFAULT_TOPICS,
  DjiCloudAdapter,
  waitForInitialMqttConnect
} from "./index.js";

test("default Basic-Link topics contain no DRC channels", () => {
  assert.equal(
    DEFAULT_TOPICS.some((topic) => topic.includes("/drc/")),
    false
  );
});


test("uses only the canonical Pilot topology status topic", () => {
  assert.equal(DEFAULT_TOPICS.includes("sys/product/+/status"), true);
  assert.equal(DEFAULT_TOPICS.includes("thing/product/+/status"), false);
});


test("initial MQTT wait resolves false instead of hanging forever", async () => {
  const client = new EventEmitter() as unknown as MqttClient;
  const connected = await waitForInitialMqttConnect(client, 5);
  assert.equal(connected, false);
});

test("initial MQTT wait resolves true on connect", async () => {
  const client = new EventEmitter() as unknown as MqttClient;
  const waiting = waitForInitialMqttConnect(client, 100);
  queueMicrotask(() => client.emit("connect"));
  assert.equal(await waiting, true);
});

test("broker loss marks known DJI devices offline and notifies registry", async () => {
  const adapter = new DjiCloudAdapter({
    brokerUrl: "mqtt://unused.invalid"
  });
  const seen: AdapterDevice[] = [];
  const device: AdapterDevice = {
    identity: {
      id: "M4T-001",
      serialNumber: "M4T-001",
      vendor: "DJI"
    },
    adapterId: "dji-cloud",
    capabilities: [],
    connected: true,
    lastSeenAt: 10
  };

  const internal = adapter as unknown as {
    devices: Map<string, AdapterDevice>;
    events: {
      onDevice(device: AdapterDevice): void;
    };
    markKnownDevicesDisconnected(at: number): Promise<void>;
  };
  internal.devices.set(device.identity.id, device);
  internal.events = {
    onDevice(next) {
      seen.push(next);
    }
  };

  await internal.markKnownDevicesDisconnected(20);

  assert.equal(internal.devices.get("M4T-001")?.connected, false);
  assert.equal(internal.devices.get("M4T-001")?.lastSeenAt, 20);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.connected, false);
});
