import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_STICK_CENTER,
  DrcController,
  type DjiMqttPublisher
} from "./drc.js";
import type { DjiServiceRequester } from "./service.js";

test("global policy allows drone_control but blocks stick_control", async () => {
  const publications: Array<{ topic: string; payload: any; qos: number }> = [];

  const services: DjiServiceRequester = {
    async requestService() {
      throw new Error("service path must not be used by DRC policy test");
    }
  };

  const publisher: DjiMqttPublisher = {
    async publish(topic, payload, qos) {
      publications.push({ topic, payload, qos });
    }
  };

  const controller = new DrcController(services, publisher, {
    minControlIntervalMs: 1
  });

  const seq = await controller.sendControl("RC-PLUS2-001", {
    x: 0,
    y: 0,
    h: 0,
    w: 0
  });

  assert.equal(seq, 0);
  assert.equal(publications.length, 1);
  assert.equal(publications[0]?.topic, "thing/product/RC-PLUS2-001/drc/down");
  assert.equal(publications[0]?.payload?.method, "drone_control");

  await assert.rejects(
    () =>
      controller.sendStickControl("RC-PLUS2-001", {
        roll: DJI_STICK_CENTER,
        pitch: DJI_STICK_CENTER,
        throttle: DJI_STICK_CENTER,
        yaw: DJI_STICK_CENTER
      }),
    /dji_cloud_stick_control_disabled/
  );

  assert.equal(publications.length, 1);
});
