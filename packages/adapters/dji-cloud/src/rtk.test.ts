import assert from "node:assert/strict";
import test from "node:test";

import { parseDjiRtkStatus, RtkFixMonitor } from "./rtk.js";

function status(
  isFixed: number | undefined,
  quality?: number,
  sampledAt = 1,
  rtkNumber: number | undefined = 0
) {
  return parseDjiRtkStatus(
    {
      data: {
        position_state: {
          ...(isFixed !== undefined ? { is_fixed: isFixed } : {}),
          ...(quality !== undefined ? { quality } : {}),
          ...(rtkNumber !== undefined ? { rtk_number: rtkNumber } : {})
        }
      }
    },
    sampledAt
  );
}

test("keeps DJI is_fixed as acquisition state, not RTK proof", () => {
  assert.equal(status(0, 5)?.fixState, "not_started");
  assert.equal(status(1, 5)?.fixState, "fixing");
  assert.equal(status(2, 5)?.fixState, "fixed");
  assert.equal(status(3, 5)?.fixState, "failed");

  assert.equal(status(0, 5)?.isFixed, false);
  assert.equal(status(1, 5)?.isFixed, false);
  assert.equal(status(2, 5)?.isFixed, false);
  assert.equal(status(3, 5)?.isFixed, false);
});

test("quality 10 is required for a positive RTK fix", () => {
  assert.equal(status(2, 10)?.isFixed, true);
  assert.equal(status(undefined, 10)?.isFixed, true);

  // Contradictory acquisition state fails closed.
  assert.equal(status(1, 10)?.isFixed, false);
  assert.equal(status(3, 10)?.isFixed, false);
});

test("GPS-only payload is not RTK evidence", () => {
  assert.equal(
    parseDjiRtkStatus({
      data: {
        position_state: {
          gps_number: 18,
          is_fixed: 2,
          quality: 5
        }
      }
    }),
    undefined
  );
});

test("RTK satellite field establishes RTK telemetry even without fixed state", () => {
  const parsed = parseDjiRtkStatus({
    data: {
      position_state: {
        gps_number: 18,
        rtk_number: 0,
        is_fixed: 2,
        quality: 5
      }
    }
  });

  assert.ok(parsed);
  assert.equal(parsed.rtkSatellites, 0);
  assert.equal(parsed.isFixed, false);
});

test("mode 18 is RTK-specific evidence but not proof of a fixed solution", () => {
  const parsed = parseDjiRtkStatus({
    data: {
      mode_code: 18,
      position_state: {
        gps_number: 18
      }
    }
  });

  assert.ok(parsed);
  assert.equal(parsed.airborneRtkFixingMode, true);
  assert.equal(parsed.isFixed, undefined);
});

for (const next of [
  { isFixed: 2, quality: 5 },
  { isFixed: 1, quality: 5 },
  { isFixed: 3, quality: 5 }
]) {
  test(`RTK fix loss triggers when quality leaves RTK-fixed state (${next.isFixed}/${next.quality})`, () => {
    const monitor = new RtkFixMonitor();

    const fixed = status(2, 10, 1_000);
    const lost = status(next.isFixed, next.quality, 2_000);
    assert.ok(fixed);
    assert.ok(lost);

    assert.equal(monitor.observe("AIRCRAFT-1", fixed), undefined);

    const transition = monitor.observe("AIRCRAFT-1", lost);
    assert.equal(transition?.type, "lost");
    assert.equal(transition?.previousFixed, true);
    assert.equal(transition?.currentFixed, false);
    assert.equal(transition?.sampledAt, 2_000);
  });
}

test("RTK fix acquisition requires RTK quality 10", () => {
  const monitor = new RtkFixMonitor();
  const notFixed = status(2, 5, 1_000);
  const fixed = status(2, 10, 2_000);
  assert.ok(notFixed);
  assert.ok(fixed);

  assert.equal(monitor.observe("AIRCRAFT-1", notFixed), undefined);
  assert.equal(monitor.observe("AIRCRAFT-1", fixed)?.type, "acquired");
});
