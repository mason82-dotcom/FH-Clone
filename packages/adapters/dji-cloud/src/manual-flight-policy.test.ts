import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_STICK_CENTER,
  DrcController,
  type DjiMqttPublisher
} from "./drc.js";
import type { DjiServiceRequester } from "./service.js";

test("global policy allows both drone_control and stick_control", async () => {
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

  const droneSeq = await controller.sendControl("RC-PLUS2-001", {
    x: 0,
    y: 0,
    h: 0,
    w: 0
  });

  assert.equal(droneSeq, 0);
  assert.equal(publications[0]?.topic, "thing/product/RC-PLUS2-001/drc/down");
  assert.equal(publications[0]?.payload?.method, "drone_control");

  const stickSeq = await controller.sendStickControl("RC-PLUS2-001", {
    roll: DJI_STICK_CENTER,
    pitch: DJI_STICK_CENTER,
    throttle: DJI_STICK_CENTER,
    yaw: DJI_STICK_CENTER
  });

  assert.equal(stickSeq, 1);
  assert.equal(publications[1]?.topic, "thing/product/RC-PLUS2-001/drc/down");
  assert.equal(publications[1]?.payload?.method, "stick_control");
  assert.equal(publications.length, 2);
});
