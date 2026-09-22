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
