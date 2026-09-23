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


test("normalizes documented DJI camera array fields by exact payload_index and retains raw array", () => {
  const cameras = [
    {
      payload_index: "77-1-0",
      camera_mode: 1,
      photo_state: 0,
      recording_state: 1,
      remain_photo_num: 321,
      remain_record_duration: 600,
      record_time: 42,
      zoom_factor: 7.5,
      ir_zoom_factor: 4,
      future_field: "kept-raw"
    }
  ];

  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    { data: { cameras } },
    1_000
  );

  const values = new Map(
    result.samples.map((entry) => [entry.key, entry])
  );

  assert.equal(
    values.get("camera.77-1-0.payload_index")?.value,
    "77-1-0"
  );
  assert.equal(
    values.get("camera.77-1-0.mode.code")?.value,
    1
  );
  assert.equal(
    values.get("camera.77-1-0.capture.photo_state_code")?.value,
    0
  );
  assert.equal(
    values.get("camera.77-1-0.recording.state_code")?.value,
    1
  );
  assert.equal(
    values.get("camera.77-1-0.storage.remaining_photos")?.value,
    321
  );
  assert.equal(
    values.get(
      "camera.77-1-0.storage.remaining_record_seconds"
    )?.unit,
    "s"
  );
  assert.equal(
    values.get("camera.77-1-0.recording.elapsed_seconds")?.value,
    42
  );
  assert.equal(
    values.get("camera.77-1-0.zoom.factor")?.value,
    7.5
  );
  assert.equal(
    values.get("camera.77-1-0.thermal.zoom_factor")?.value,
    4
  );

  const raw = values.get("raw.dji-cloud.cameras");
  assert.deepEqual(raw?.value, cameras);
  assert.equal(
    result.capabilities.includes("telemetry.camera"),
    true
  );
  assert.equal(result.capabilities.includes("media.read"), false);
});

test("does not invent camera identity when payload_index is missing or malformed", () => {
  const cameras = [
    { camera_mode: 0, recording_state: 0 },
    {
      payload_index: "../../camera",
      camera_mode: 1,
      recording_state: 1
    }
  ];

  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    { data: { cameras } },
    1_000
  );

  assert.equal(
    result.samples.some((entry) =>
      entry.key.startsWith("camera.")
    ),
    false
  );
  assert.deepEqual(
    result.samples.find(
      (entry) => entry.key === "raw.dji-cloud.cameras"
    )?.value,
    cameras
  );
});

test("normalizes documented payload-scoped gimbal axes in degrees and keeps raw fields", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        "77-1-0": {
          gimbal_pitch: -45.5,
          gimbal_roll: 1.25,
          gimbal_yaw: 123.4,
          unknown_payload_state: 9
        }
      }
    },
    1_000
  );

  const values = new Map(
    result.samples.map((entry) => [entry.key, entry])
  );

  assert.equal(
    values.get("gimbal.77-1-0.pitch_deg")?.value,
    -45.5
  );
  assert.equal(
    values.get("gimbal.77-1-0.roll_deg")?.unit,
    "deg"
  );
  assert.equal(
    values.get("gimbal.77-1-0.yaw_deg")?.value,
    123.4
  );
  assert.equal(
    values.get("raw.dji-cloud.77-1-0.gimbal_pitch")?.value,
    -45.5
  );
  assert.equal(
    values.get(
      "raw.dji-cloud.77-1-0.unknown_payload_state"
    )?.value,
    9
  );
  assert.equal(
    result.capabilities.includes("telemetry.gimbal"),
    true
  );
  assert.equal(
    result.capabilities.some((capability) =>
      capability.startsWith("control.")
    ),
    false
  );
});


test("malformed numeric camera and gimbal values stay raw-only", () => {
  const result = normalizeDjiPayload(
    "AIRCRAFT-1",
    {
      data: {
        cameras: [
          {
            payload_index: "77-1-0",
            camera_mode: "recording",
            zoom_factor: "7.5"
          }
        ],
        "77-1-0": {
          gimbal_pitch: "-45"
        }
      }
    },
    1_000
  );

  assert.equal(
    result.samples.some(
      (entry) => entry.key === "camera.77-1-0.mode.code"
    ),
    false
  );
  assert.equal(
    result.samples.some(
      (entry) => entry.key === "camera.77-1-0.zoom.factor"
    ),
    false
  );
  assert.equal(
    result.samples.some(
      (entry) => entry.key === "gimbal.77-1-0.pitch_deg"
    ),
    false
  );
  assert.ok(
    result.samples.some(
      (entry) => entry.key === "raw.dji-cloud.cameras"
    )
  );
  assert.equal(
    result.samples.find(
      (entry) =>
        entry.key === "raw.dji-cloud.77-1-0.gimbal_pitch"
    )?.value,
    "-45"
  );
});
