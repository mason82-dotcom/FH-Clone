import assert from "node:assert/strict";
import test from "node:test";

import {
  MediaOverlayRegistry,
  isMediaAsset
} from "./media-overlay.js";

test("thermal capture with real GPS context becomes a thermal overlay", () => {
  const registry = new MediaOverlayRegistry();
  const point = registry.upsert({
    id: "thermal-1",
    fileName: "DJI_0001_R.JPG",
    sensor: {
      id: "89-0-0",
      kind: "thermal",
      confidence: "authoritative"
    },
    band: {
      name: "THERMAL",
      confidence: "authoritative",
      source: "DJI payload contract"
    },
    capture: {
      deviceId: "M4T-001",
      latitudeDeg: 49.124,
      longitudeDeg: 8.598,
      ellipsoidHeightM: 132.4,
      capturedAt: 1_790_000_000_000,
      payloadId: "89-0-0"
    },
    profile: "THERMAL"
  });

  assert.equal(point?.layer, "thermal");
  assert.equal(point?.heightM, 132.4);
  assert.deepEqual(registry.list().thermal.map((item) => item.id), ["thermal-1"]);
});

test("multispectral and NDVI assets use the multispectral overlay", () => {
  const registry = new MediaOverlayRegistry();

  registry.upsert({
    id: "red-1",
    sensor: {
      id: "m3m-ms",
      kind: "multispectral",
      confidence: "authoritative"
    },
    band: {
      name: "RED",
      confidence: "authoritative"
    },
    capture: {
      deviceId: "M3M-001",
      latitudeDeg: 49.1,
      longitudeDeg: 8.6
    },
    profile: "MULTISPECTRAL"
  });

  registry.upsert({
    id: "ndvi-1",
    sensor: {
      id: "processor",
      kind: "multispectral",
      confidence: "derived"
    },
    capture: {
      deviceId: "M3M-001",
      latitudeDeg: 49.1001,
      longitudeDeg: 8.6001
    },
    profile: "NDVI"
  });

  assert.deepEqual(
    registry.list().multispectral.map((item) => item.id).sort(),
    ["ndvi-1", "red-1"]
  );
});

test("asset without authoritative position is retained but not mapped", () => {
  const registry = new MediaOverlayRegistry();

  const point = registry.upsert({
    id: "thermal-no-position",
    sensor: {
      id: "89-0-0",
      kind: "thermal",
      confidence: "authoritative"
    },
    capture: {
      deviceId: "M4T-001"
    },
    profile: "THERMAL"
  });

  assert.equal(point, undefined);
  assert.equal(registry.size(), 1);
  assert.equal(registry.list().thermal.length, 0);
});

test("runtime validator rejects invalid coordinates and incomplete assets", () => {
  assert.equal(
    isMediaAsset({
      id: "bad",
      sensor: {
        id: "89-0-0",
        kind: "thermal",
        confidence: "authoritative"
      },
      capture: {
        deviceId: "M4T-001",
        latitudeDeg: 100,
        longitudeDeg: 8
      },
      profile: "THERMAL"
    }),
    false
  );

  assert.equal(isMediaAsset({ id: "bad" }), false);
});
