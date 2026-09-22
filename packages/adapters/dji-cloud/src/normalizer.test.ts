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

test("M4D/M4TD property arrays are flattened without leaking wireless link secrets", () => {
  const result = normalizeDjiPayload(
    "M4TD-001",
    {
      data: {
        attitude_pitch: 3.5,
        attitude_roll: -1.2,
        cameras: [
          {
            payload_index: "99-0-0",
            camera_mode: 0,
            ir_metering_area: {
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4,
              temperature: 42.5
            }
          }
        ],
        "99-0-0": {
          gimbal_pitch: -30,
          gimbal_roll: 0.5,
          gimbal_yaw: 92,
          thermal_gain_mode: 2,
          measure_target_distance: 17.3
        },
        battery: {
          capacity_percent: 76,
          batteries: [
            {
              index: 0,
              sn: "BATTERY-001",
              temperature: 31.4
            }
          ]
        },
        position_state: {
          is_fixed: 2,
          quality: 10,
          gps_number: 22,
          rtk_number: 28
        },
        wireless_link_topo: {
          secret_code: Array.from({ length: 28 }, (_, index) => index),
          leaf_nodes: [
            {
              sn: "DOCK3-001",
              sdr_id: 123,
              control_source_index: 1
            }
          ]
        }
      }
    },
    2_000
  );

  assert.equal(result.capabilities.includes("telemetry.camera"), true);
  assert.equal(result.capabilities.includes("telemetry.gimbal"), true);
  assert.equal(result.capabilities.includes("telemetry.battery"), true);
  assert.equal(result.capabilities.includes("telemetry.rtk"), true);

  assert.equal(
    result.samples.find((sample) => sample.key === "flight.attitude.pitch_deg")?.value,
    3.5
  );
  assert.equal(
    result.samples.find((sample) => sample.key === "flight.attitude.roll_deg")?.value,
    -1.2
  );
  assert.equal(
    result.samples.find((sample) => sample.key === "payload.gimbal.pitch_deg")?.value,
    -30
  );
  assert.equal(
    result.samples.find(
      (sample) => sample.rawKey === "cameras.0.payload_index"
    )?.value,
    "99-0-0"
  );
  assert.equal(
    result.samples.find(
      (sample) => sample.rawKey === "battery.batteries.0.temperature"
    )?.value,
    31.4
  );
  assert.equal(
    result.samples.some((sample) => sample.rawKey.includes("secret_code")),
    false
  );
});

