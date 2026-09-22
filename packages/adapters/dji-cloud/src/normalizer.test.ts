import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDjiPayload } from "./normalizer.js";

test("GPS-only telemetry does not claim RTK capability", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        position_state: {
          gps_number: 18,
          is_fixed: 2,
          quality: 5
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.flight"), true);
  assert.equal(result.capabilities.includes("telemetry.rtk"), false);
  assert.ok(
    result.samples.some(
      (sample) =>
        sample.key === "navigation.gnss.gps_satellites" &&
        sample.value === 18
    )
  );
  assert.ok(
    result.samples.some(
      (sample) =>
        sample.key === "navigation.gnss.fix_state_code" &&
        sample.value === 2
    )
  );
});

test("observed rtk_number enables RTK telemetry without inventing a fix", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        position_state: {
          gps_number: 18,
          rtk_number: 0,
          is_fixed: 2,
          quality: 5
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.rtk"), true);
  const fixed = result.samples.find(
    (sample) => sample.key === "navigation.rtk.fixed"
  );
  assert.equal(fixed?.value, false);
});

test("quality 10 with consistent acquisition state yields RTK fixed", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        position_state: {
          gps_number: 18,
          rtk_number: 24,
          is_fixed: 2,
          quality: 10
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.rtk"), true);
  assert.equal(
    result.samples.find(
      (sample) => sample.key === "navigation.rtk.fixed"
    )?.value,
    true
  );
});

test("airborne RTK fixing mode enables RTK telemetry but not fixed=true", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        mode_code: 18,
        position_state: {
          gps_number: 18
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.rtk"), true);
  assert.equal(
    result.samples.some(
      (sample) =>
        sample.key === "navigation.rtk.airborne_fixing_mode" &&
        sample.value === true
    ),
    true
  );
  assert.equal(
    result.samples.some(
      (sample) => sample.key === "navigation.rtk.fixed"
    ),
    false
  );
});


test("observed camera and gimbal properties expose only telemetry capabilities", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        cameras: [
          {
            payload_index: "89-0-0",
            camera_mode: 0,
            photo_state: 0,
            recording_state: 0
          }
        ],
        "89-0-0": {
          gimbal_pitch: -45,
          gimbal_roll: 0,
          gimbal_yaw: 12
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.camera"), true);
  assert.equal(result.capabilities.includes("telemetry.gimbal"), true);
  assert.equal(result.capabilities.includes("media.read"), false);
  assert.equal(result.capabilities.includes("livestream.read"), false);
});

test("live_capacity alone does not advertise an unimplemented livestream feature", () => {
  const result = normalizeDjiPayload(
    "RC-PLUS2-001",
    {
      data: {
        live_capacity: {
          available_video_number: 4,
          coexist_video_number_max: 2,
          device_list: []
        }
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("livestream.read"), false);
});

test("media-looking raw metadata does not advertise media.read without media integration", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        remain_photo_num: 100,
        remain_record_duration: 600,
        recording_state: 0
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("media.read"), false);
});


test("wayline flight mode is observation, not mission.wayline capability", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        mode_code: 5,
        latitude: 49.0,
        longitude: 8.5
      }
    },
    1_000
  );

  assert.equal(result.capabilities.includes("telemetry.flight"), true);
  assert.equal(result.capabilities.includes("mission.wayline"), false);
  assert.equal(
    result.samples.find((sample) => sample.key === "flight.mode.code")?.value,
    5
  );
});

test("DJI attitude_pitch and attitude_roll map to canonical aircraft attitude", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        attitude_head: 123.5,
        attitude_pitch: -4.25,
        attitude_roll: 7.75
      }
    },
    1_000
  );

  assert.equal(
    result.samples.find((sample) => sample.key === "flight.attitude.yaw_deg")?.value,
    123.5
  );
  assert.equal(
    result.samples.find((sample) => sample.key === "flight.attitude.pitch_deg")?.value,
    -4.25
  );
  assert.equal(
    result.samples.find((sample) => sample.key === "flight.attitude.roll_deg")?.value,
    7.75
  );
  assert.equal(
    result.samples.some((sample) => sample.key === "raw.dji-cloud.attitude_pitch"),
    false
  );
  assert.equal(
    result.samples.some((sample) => sample.key === "raw.dji-cloud.attitude_roll"),
    false
  );
});
