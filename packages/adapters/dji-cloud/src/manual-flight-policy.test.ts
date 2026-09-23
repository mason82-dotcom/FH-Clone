import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_STICK_CENTER,
  DrcController,
  type DjiMqttPublisher
} from "./drc.js";
import type { DjiServiceRequester } from "./service.js";

test("global policy blocks cloud stick and legacy manual flight commands before publish", async () => {
  const publications: Array<{ topic: string; payload: unknown }> = [];

  const services: DjiServiceRequester = {
    async requestService() {
      throw new Error("service path must not be used by manual-flight policy test");
    }
  };

  const publisher: DjiMqttPublisher = {
    async publish(topic, payload) {
      publications.push({ topic, payload });
    }
  };

  const controller = new DrcController(services, publisher);

  await assert.rejects(
    () =>
      controller.sendStickControl("RC-PLUS2-001", {
        roll: DJI_STICK_CENTER,
        pitch: DJI_STICK_CENTER,
        throttle: DJI_STICK_CENTER,
        yaw: DJI_STICK_CENTER
      }),
    /dji_cloud_manual_flight_control_disabled/
  );

  await assert.rejects(
    () =>
      controller.sendControl("RC-PLUS2-001", {
        x: 0,
        y: 0,
        h: 0,
        w: 0
      }),
    /dji_cloud_manual_flight_control_disabled/
  );

  assert.equal(publications.length, 0);
});
