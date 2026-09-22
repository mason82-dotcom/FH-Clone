import assert from "node:assert/strict";
import test from "node:test";

import { parseDjiRtkStatus, RtkFixMonitor } from "./rtk.js";

function status(isFixed: number | undefined, quality?: number, sampledAt = 1) {
  return parseDjiRtkStatus(
    {
      data: {
        position_state: {
          ...(isFixed !== undefined ? { is_fixed: isFixed } : {}),
          ...(quality !== undefined ? { quality } : {})
        }
      }
    },
    sampledAt
  );
}

test("maps DJI is_fixed enum 0/1/2/3 without collapsing it to a boolean", () => {
  assert.equal(status(0)?.fixState, "not_started");
  assert.equal(status(1)?.fixState, "fixing");
  assert.equal(status(2)?.fixState, "fixed");
  assert.equal(status(3)?.fixState, "failed");

  assert.equal(status(0)?.isFixed, false);
  assert.equal(status(1)?.isFixed, false);
  assert.equal(status(2)?.isFixed, true);
  assert.equal(status(3)?.isFixed, false);
});

test("quality 10 is only a fallback when is_fixed is absent", () => {
  assert.equal(status(undefined, 10)?.isFixed, true);
  assert.equal(status(1, 10)?.isFixed, false);
  assert.equal(status(3, 10)?.isFixed, false);
});

for (const nextCode of [0, 1, 3]) {
  test(`fix loss triggers on DJI transition 2 -> ${nextCode}`, () => {
    const monitor = new RtkFixMonitor();

    const fixed = status(2, 10, 1_000);
    const next = status(nextCode, 10, 2_000);
    assert.ok(fixed);
    assert.ok(next);

    assert.equal(monitor.observe("AIRCRAFT-1", fixed), undefined);

    const transition = monitor.observe("AIRCRAFT-1", next);
    assert.equal(transition?.type, "lost");
    assert.equal(transition?.previousFixed, true);
    assert.equal(transition?.currentFixed, false);
    assert.equal(transition?.sampledAt, 2_000);
  });
}

test("fix acquisition triggers when a non-fixed enum enters state 2", () => {
  const monitor = new RtkFixMonitor();
  const fixing = status(1, 1, 1_000);
  const fixed = status(2, 10, 2_000);
  assert.ok(fixing);
  assert.ok(fixed);

  assert.equal(monitor.observe("AIRCRAFT-1", fixing), undefined);
  assert.equal(monitor.observe("AIRCRAFT-1", fixed)?.type, "acquired");
});
