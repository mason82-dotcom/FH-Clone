import assert from "node:assert/strict";
import test from "node:test";
import type { RawMessage } from "@fh-clone/aircraft-core";
import { MissionSessionTracker } from "./mission-session.js";

function message(
  receivedAt: number,
  modeCode: number,
  deviceId = "AIRCRAFT-1"
): RawMessage {
  return {
    adapterId: "dji-cloud",
    deviceId,
    receivedAt,
    channel: `thing/product/${deviceId}/osd`,
    payload: {
      data: {
        mode_code: modeCode
      }
    }
  };
}

test("does not start a mission in standby or takeoff preparation", () => {
  const tracker = new MissionSessionTracker();

  tracker.observe(message(1_000, 0));
  tracker.observe(message(2_000, 1));
  tracker.observe(message(3_000, 2));

  assert.equal(tracker.getActive("AIRCRAFT-1"), undefined);
});

test("starts on active flight and ends after stable standby grace", () => {
  const tracker = new MissionSessionTracker({
    standbyGraceMs: 5_000
  });

  const started = tracker.observe(message(10_000, 4));
  assert.ok(started);
  assert.equal(started.startedAt, 10_000);
  assert.equal(started.lastModeCode, 4);

  const same = tracker.observe(message(12_000, 3));
  assert.equal(same?.missionId, started.missionId);

  tracker.observe(message(13_000, 0));
  assert.ok(tracker.getActive("AIRCRAFT-1"));

  tracker.observe(message(18_100, 0));
  assert.equal(tracker.getActive("AIRCRAFT-1"), undefined);

  const completed = tracker.getLastCompleted("AIRCRAFT-1");
  assert.equal(completed?.missionId, started.missionId);
  assert.equal(completed?.endReason, "standby");
  assert.equal(completed?.endedAt, 18_100);
});

test("ends active mission after telemetry timeout", () => {
  const tracker = new MissionSessionTracker({
    telemetryTimeoutMs: 30_000
  });

  const started = tracker.observe(message(100_000, 5));
  assert.ok(started);

  const ended = tracker.sweep(130_001);
  assert.equal(ended.length, 1);
  assert.equal(ended[0]?.missionId, started.missionId);
  assert.equal(ended[0]?.endReason, "telemetry_timeout");
});

test("new flight gets a new mission id", () => {
  const tracker = new MissionSessionTracker({
    standbyGraceMs: 1_000
  });

  const first = tracker.observe(message(200_000, 3));
  assert.ok(first);

  tracker.observe(message(201_000, 0));
  tracker.observe(message(202_001, 0));

  const second = tracker.observe(message(203_000, 3));
  assert.ok(second);
  assert.notEqual(second.missionId, first.missionId);
});

test("keeps gateway identity on the mission session", () => {
  const tracker = new MissionSessionTracker({
    resolveGatewaySn: () => "RC-PRO-1"
  });

  const started = tracker.observe(message(300_000, 18));
  assert.equal(started?.gatewaySn, "RC-PRO-1");
});
