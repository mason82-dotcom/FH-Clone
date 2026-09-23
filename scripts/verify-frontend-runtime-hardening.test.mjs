import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  asRtkSnapshotPayload,
  isRtkStatusEvent,
  isRtkTransitionEvent,
  parseSseJsonEvent
} from "../apps/web/src/hooks/rtkSseGuards.js";

const rtk = fs.readFileSync(
  "apps/web/src/hooks/useRtkLive.ts",
  "utf8"
);
const overlays = fs.readFileSync(
  "apps/web/src/fh2/Fh2OverlayController.tsx",
  "utf8"
);

const validSnapshot = {
  deviceId: "DJI-TEST-1",
  fixState: "fixed",
  airborneRtkFixingMode: true,
  sampledAt: 1_700_000_000_000,
  stale: false,
  ageMs: 0
};

test("RTK SSE parser ignores invalid JSON and malformed snapshot payloads", () => {
  assert.equal(parseSseJsonEvent({ data: "{" }), undefined);
  assert.equal(asRtkSnapshotPayload(null), undefined);
  assert.equal(asRtkSnapshotPayload({}), undefined);
  assert.equal(asRtkSnapshotPayload([{}]), undefined);
  assert.deepEqual(asRtkSnapshotPayload(validSnapshot), [validSnapshot]);
  assert.deepEqual(asRtkSnapshotPayload([validSnapshot]), [validSnapshot]);
});

test("RTK SSE status guard rejects missing structure", () => {
  assert.equal(isRtkStatusEvent(null), false);
  assert.equal(isRtkStatusEvent({}), false);
  assert.equal(
    isRtkStatusEvent({
      type: "status",
      deviceId: "DJI-TEST-1",
      status: {}
    }),
    false
  );
  assert.equal(
    isRtkStatusEvent({
      type: "status",
      deviceId: "DJI-TEST-1",
      status: {
        fixState: "fixed",
        airborneRtkFixingMode: true,
        sampledAt: 1_700_000_000_000
      }
    }),
    true
  );
});

test("RTK SSE transition guard rejects malformed events", () => {
  assert.equal(isRtkTransitionEvent(null), false);
  assert.equal(isRtkTransitionEvent({}), false);
  assert.equal(
    isRtkTransitionEvent({
      type: "fix-transition",
      deviceId: "DJI-TEST-1",
      transition: {}
    }),
    false
  );
  assert.equal(
    isRtkTransitionEvent({
      type: "fix-transition",
      deviceId: "DJI-TEST-1",
      transition: {
        deviceId: "DJI-TEST-1",
        type: "acquired",
        sampledAt: 1_700_000_000_000,
        previousFixed: false,
        currentFixed: true
      }
    }),
    true
  );
});

test("RTK SSE handlers use runtime structure guards", () => {
  assert.match(rtk, /asRtkSnapshotPayload\(parseSseJsonEvent\(event\)\)/);
  assert.match(rtk, /isRtkStatusEvent\(candidate\)/);
  assert.match(rtk, /isRtkTransitionEvent\(candidate\)/);
});

test("overlay polling keeps one slow request alive instead of aborting every tick", () => {
  const abortControllers = overlays.match(/new AbortController\(\)/g) ?? [];
  const inFlightSkips = overlays.match(/if \(controller\) return;/g) ?? [];
  const cleanupAborts = overlays.match(/controller\?\.abort\(\);/g) ?? [];
  const releases = overlays.match(/controller === request\) controller = undefined/g) ?? [];

  assert.equal(abortControllers.length >= 3, true);
  assert.equal(inFlightSkips.length >= 3, true);
  assert.equal(cleanupAborts.length, 3);
  assert.equal(releases.length >= 3, true);
  assert.match(overlays, /signal:\s*request\.signal/);
});
