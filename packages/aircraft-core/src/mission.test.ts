import assert from "node:assert/strict";
import test from "node:test";

import { createMissionExternalReference } from "./mission.js";

test("normalizes mission reference ids without changing provenance", () => {
  assert.deepEqual(
    createMissionExternalReference({
      kind: "wayline",
      id: "  WL-123  ",
      source: "dji_pilot_wayline",
      confidence: "authoritative"
    }),
    {
      kind: "wayline",
      id: "WL-123",
      source: "dji_pilot_wayline",
      confidence: "authoritative"
    }
  );
});

test("rejects empty external mission ids", () => {
  assert.throws(
    () =>
      createMissionExternalReference({
        kind: "fh2_flight_task",
        id: "   ",
        source: "fh2_openapi_v2",
        confidence: "authoritative"
      }),
    /Mission reference id is required/
  );
});
