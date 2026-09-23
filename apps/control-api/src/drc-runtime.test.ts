import assert from "node:assert/strict";
import test from "node:test";

import { markAllDrcTransportsLost } from "./drc-runtime.js";

test("transport loss attempts every open DRC session before aggregating failures", async () => {
  const attempted: string[] = [];
  const manager = {
    async listOpenSessions() {
      return [
        { gatewaySn: "RC-1" },
        { gatewaySn: "RC-2" },
        { gatewaySn: "RC-3" }
      ];
    },
    async markTransportLost(gatewaySn: string, reason?: string) {
      attempted.push(`${gatewaySn}:${reason}`);
      if (gatewaySn === "RC-2") {
        throw new Error("state_persist_failed");
      }
    }
  };

  await assert.rejects(
    markAllDrcTransportsLost(manager, "mqtt_close"),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors.length === 1 &&
      /transport-loss update failed for 1 session/.test(error.message)
  );

  assert.deepEqual(attempted.sort(), [
    "RC-1:mqtt_close",
    "RC-2:mqtt_close",
    "RC-3:mqtt_close"
  ]);
});

test("transport loss resolves when all open sessions are updated", async () => {
  const attempted: string[] = [];
  const manager = {
    async listOpenSessions() {
      return [{ gatewaySn: "RC-1" }, { gatewaySn: "RC-2" }];
    },
    async markTransportLost(gatewaySn: string) {
      attempted.push(gatewaySn);
    }
  };

  await markAllDrcTransportsLost(manager, "mqtt_offline");
  assert.deepEqual(attempted.sort(), ["RC-1", "RC-2"]);
});
