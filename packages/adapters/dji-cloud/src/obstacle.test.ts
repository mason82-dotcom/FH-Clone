import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDjiHsiObstacleInfo,
  normalizeDjiObstacleAvoidanceState
} from "./obstacle.js";

test("normalizes normal OSD obstacle sensing enable state", () => {
  const result = normalizeDjiObstacleAvoidanceState(
    "M3T-001",
    {
      data: {
        obstacle_avoidance: {
          horizon: 1,
          upside: 0,
          downside: 1
        }
      }
    },
    100
  );

  assert.deepEqual(
    result.samples.map((item) => [item.key, item.value]),
    [
      ["safety.obstacle.horizontal.enabled", true],
      ["safety.obstacle.up.enabled", false],
      ["safety.obstacle.down.enabled", true]
    ]
  );
  assert.deepEqual(result.capabilities, ["telemetry.obstacle"]);
});

test("normalizes DRC hsi_info_push distances from millimeters to meters", () => {
  const result = normalizeDjiHsiObstacleInfo(
    "M4T-001",
    {
      method: "hsi_info_push",
      data: {
        front_enable: true,
        front_work: true,
        up_distance: 1250,
        down_distance: 500,
        around_distances: [1000, 2500, 4000]
      }
    },
    200
  );

  const byKey = new Map(result.samples.map((item) => [item.key, item]));
  assert.equal(byKey.get("safety.obstacle.front.enabled")?.value, true);
  assert.equal(byKey.get("safety.obstacle.front.working")?.value, true);
  assert.equal(byKey.get("safety.obstacle.up.distance_m")?.value, 1.25);
  assert.equal(byKey.get("safety.obstacle.down.distance_m")?.value, 0.5);
  assert.deepEqual(
    byKey.get("safety.obstacle.around.distance_m")?.value,
    [1, 2.5, 4]
  );
  assert.equal(byKey.get("safety.obstacle.up.distance_m")?.unit, "m");
});

test("accepts DJI example alias around_distance without guessing malformed data", () => {
  const valid = normalizeDjiHsiObstacleInfo(
    "M4T-001",
    {
      method: "hsi_info_push",
      data: { around_distance: [10, 20] }
    },
    300
  );
  assert.deepEqual(valid.samples[0]?.value, [0.01, 0.02]);

  const invalid = normalizeDjiHsiObstacleInfo(
    "M4T-001",
    {
      method: "hsi_info_push",
      data: { around_distances: [100, "bad"] }
    },
    301
  );
  assert.equal(invalid.samples.length, 0);
});

test("does not treat enable state as distance telemetry", () => {
  const result = normalizeDjiObstacleAvoidanceState(
    "M3E-001",
    { obstacle_avoidance: { horizon: 1, upside: 1, downside: 1 } },
    400
  );

  assert.equal(
    result.samples.some((item) => item.key.endsWith(".distance_m")),
    false
  );
});

test("ignores non-HSI DRC messages", () => {
  const result = normalizeDjiHsiObstacleInfo(
    "M4T-001",
    { method: "heart_beat", data: { timestamp: 1 } },
    500
  );
  assert.deepEqual(result, { samples: [], capabilities: [] });
});
