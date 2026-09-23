import assert from "node:assert/strict";
import test from "node:test";

import type { MediaAsset } from "@fh-clone/aircraft-core";
import {
  assertMediaAssetPersistenceSafe
} from "./media-store.js";

function asset(metadata: Record<string, unknown> = {}): MediaAsset {
  return {
    id: "asset-1",
    fileName: "capture.tif",
    sensor: {
      id: "sensor-1",
      kind: "multispectral",
      confidence: "authoritative"
    },
    band: {
      name: "NIR",
      confidence: "authoritative"
    },
    capture: {
      deviceId: "M3M-001",
      capturedAt: 1_700_000_000_000,
      latitudeDeg: 49.1,
      longitudeDeg: 8.5
    },
    profile: "MULTISPECTRAL",
    metadata
  };
}

test("media persistence accepts normal EXIF/XMP-style metadata", () => {
  assert.doesNotThrow(() =>
    assertMediaAssetPersistenceSafe(
      asset({
        CaptureUUID: "3377fb05-b357-448f-b87b-7023daebbaed",
        BandName: "NIR",
        CameraSerialNumber: "camera-redacted",
        Irradiance: 2000
      })
    )
  );
});

test("media persistence rejects secret-like metadata keys recursively", () => {
  assert.throws(
    () =>
      assertMediaAssetPersistenceSafe(
        asset({
          nested: {
            authorization: "Bearer should-never-persist"
          }
        })
      ),
    /media_persistence_forbidden_key:\$\.metadata\.nested\.authorization/
  );
});

test("media persistence rejects raw bearer values even under neutral keys", () => {
  assert.throws(
    () =>
      assertMediaAssetPersistenceSafe(
        asset({
          note: "upstream header Bearer abc.def.ghi"
        })
      ),
    /media_persistence_raw_bearer:\$\.metadata\.note/
  );
});

test("redacted bearer text remains persistable", () => {
  assert.doesNotThrow(() =>
    assertMediaAssetPersistenceSafe(
      asset({
        note: "Authorization failed: Bearer <redacted>"
      })
    )
  );
});
