import assert from "node:assert/strict";
import test from "node:test";

import type { ParameterSample } from "@fh-clone/aircraft-core";
import {
  assertParameterSamplePersistenceSafe,
  assertTelemetryPersistenceSafe,
  telemetryProjectionForSample
} from "./telemetry-store.js";

function sample(
  key: string,
  value: unknown
): ParameterSample {
  return {
    adapterId: "dji-cloud",
    deviceId: "AIRCRAFT-1",
    key,
    rawKey: "osd.test",
    value,
    sampledAt: 1_700_000_000_000,
    quality: "good"
  };
}

test("telemetry persistence accepts ordinary sanitized payloads", () => {
  assert.doesNotThrow(() =>
    assertTelemetryPersistenceSafe({
      position_state: {
        is_fixed: 2,
        quality: 10
      },
      cameras: [
        {
          payload_index: "67-0-0"
        }
      ]
    })
  );
});

test("telemetry persistence rejects secret-like raw fields recursively", () => {
  assert.throws(
    () =>
      assertTelemetryPersistenceSafe({
        topology: {
          device_secret: "must-not-persist"
        }
      }),
    /telemetry_persistence_forbidden_key:\$\.topology\.device_secret/
  );
});

test("telemetry persistence rejects unredacted bearer strings", () => {
  assert.throws(
    () =>
      assertTelemetryPersistenceSafe({
        note: "Authorization: Bearer abc.def.ghi"
      }),
    /telemetry_persistence_raw_bearer:\$\.note/
  );
});

test("parameter persistence rejects secret-like raw keys", () => {
  assert.throws(
    () =>
      assertParameterSamplePersistenceSafe({
        ...sample("raw.dji.token", "value"),
        rawKey: "payload.token"
      }),
    /telemetry_persistence_forbidden_key/
  );
});

test("projection maps common canonical flight and RTK keys", () => {
  assert.deepEqual(
    telemetryProjectionForSample(
      sample("flight.position.latitude_deg", 49.123)
    ),
    {
      column: "latitude",
      value: 49.123
    }
  );

  assert.deepEqual(
    telemetryProjectionForSample(
      sample("navigation.gnss.fix_state_code", 2)
    ),
    {
      column: "is_fixed",
      value: 2
    }
  );

  assert.deepEqual(
    telemetryProjectionForSample(
      sample("flight.attitude.yaw_deg", 187.5)
    ),
    {
      column: "attitude_head",
      value: 187.5
    }
  );
});

test("projection ignores unmapped, non-numeric and invalid enum samples", () => {
  assert.equal(
    telemetryProjectionForSample(
      sample("camera.0.mode", "photo")
    ),
    undefined
  );
  assert.equal(
    telemetryProjectionForSample(
      sample("navigation.gnss.fix_state_code", 7)
    ),
    undefined
  );
  assert.equal(
    telemetryProjectionForSample(
      sample("flight.position.latitude_deg", Number.NaN)
    ),
    undefined
  );
});
