import assert from "node:assert/strict";
import test from "node:test";
import type { MqttClient } from "mqtt";

import {
  DrcBrokerTransport,
  type DrcPublishedMessage
} from "./drc-transport.js";

test("DRC transport observes only successful publishes and does not gate them", async () => {
  const observed: DrcPublishedMessage[] = [];
  const transport = new DrcBrokerTransport({
    onPublished(message) {
      observed.push(message);
    }
  });

  const fakeClient = {
    publish(
      _topic: string,
      _payload: string,
      _options: { qos: number },
      callback: (error?: Error) => void
    ) {
      callback();
    }
  } as unknown as MqttClient;

  const internal = transport as unknown as {
    client: MqttClient;
    connected: boolean;
  };
  internal.client = fakeClient;
  internal.connected = true;

  await transport.publish(
    "thing/product/GATEWAY-1/drc/down",
    { method: "heart_beat", seq: 1, data: { timestamp: 1 } },
    0
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.topic, "thing/product/GATEWAY-1/drc/down");
  assert.equal(observed[0]?.qos, 0);
  assert.equal(
    (observed[0]?.payload as { method?: string }).method,
    "heart_beat"
  );
});

test("DRC evidence callback failure cannot turn a successful publish into failure", async () => {
  const transport = new DrcBrokerTransport({
    onPublished() {
      throw new Error("evidence_sink_failed");
    }
  });

  const fakeClient = {
    publish(
      _topic: string,
      _payload: string,
      _options: { qos: number },
      callback: (error?: Error) => void
    ) {
      callback();
    }
  } as unknown as MqttClient;

  const internal = transport as unknown as {
    client: MqttClient;
    connected: boolean;
  };
  internal.client = fakeClient;
  internal.connected = true;

  await assert.doesNotReject(() =>
    transport.publish(
      "thing/product/GATEWAY-1/drc/down",
      { method: "heart_beat", seq: 2, data: { timestamp: 2 } },
      0
    )
  );
});
