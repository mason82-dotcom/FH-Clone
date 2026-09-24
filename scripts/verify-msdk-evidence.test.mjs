import assert from "node:assert/strict";
import test from "node:test";

import {
  validateEvidenceDocuments
} from "./verify-msdk-evidence.mjs";

function fixture({
  markers = [],
  bridgeEvents = [],
  controlConnected = 0,
  bridgeStatus = "paired",
  extra = {}
} = {}) {
  const events = [
    ...markers.map((event) => ({
      atMs: 1,
      source: "marker",
      event
    })),
    ...bridgeEvents.map((event) => ({
      atMs: 5,
      source: "bridge",
      event
    })),
    ...Array.from({ length: controlConnected }, (_, index) => ({
      atMs: 10 + index,
      source: "control",
      event: "state_changed",
      status: "connected"
    }))
  ];

  return {
    schema: "fh2.msdk.v1",
    timestampMs: 1,
    sdk: {},
    gateway: {},
    aircraft: {},
    sensors: [],
    rtk: {},
    control: {},
    capabilities: {},
    evidence: {
      schema: "fh2.pairing-transport-evidence.v1",
      bridge: {
        status: bridgeStatus
      },
      controlChannel: {
        status: "disconnected"
      },
      events
    },
    ...extra
  };
}

test("acceptance succeeds across multiple process fixtures", () => {
  const result = validateEvidenceDocuments(
    [
      {
        name: "pair-reconnect.json",
        document: fixture({
          markers: [
            "pairing_accepted"
          ],
          bridgeEvents: [
            "heartbeat_established"
          ],
          controlConnected: 2
        })
      },
      {
        name: "app-restart.json",
        document: fixture({
          markers: [
            "stored_pairing_resumed"
          ],
          bridgeEvents: [
            "heartbeat_established"
          ],
          controlConnected: 1
        })
      },
      {
        name: "unpair.json",
        document: fixture({
          markers: [
            "unpair_revocation_accepted",
            "pairing_cleared_local"
          ],
          bridgeStatus: "disconnected"
        })
      }
    ],
    { acceptance: true }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("acceptance fails when control reconnect is not evidenced", () => {
  const result = validateEvidenceDocuments(
    [
      {
        name: "single-connect.json",
        document: fixture({
          markers: [
            "pairing_accepted",
            "stored_pairing_resumed",
            "unpair_revocation_accepted",
            "pairing_cleared_local"
          ],
          bridgeEvents: [
            "heartbeat_established"
          ],
          controlConnected: 1,
          bridgeStatus: "disconnected"
        })
      }
    ],
    { acceptance: true }
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.includes("acceptance_missing_control_reconnect")
  );
});

test("secret-like fields and raw bearer values are rejected", () => {
  const result = validateEvidenceDocuments([
    {
      name: "leak.json",
      document: fixture({
        extra: {
          agentToken: "should-not-exist",
          note: "Bearer abc.def.ghi"
        }
      })
    }
  ]);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((entry) =>
      entry.includes("forbidden_key:$.agentToken")
    )
  );
  assert.ok(
    result.errors.some((entry) =>
      entry.includes("raw_bearer_at:$.note")
    )
  );
});

test("redacted bearer text is allowed", () => {
  const result = validateEvidenceDocuments([
    {
      name: "redacted.json",
      document: fixture({
        extra: {
          note: "HTTP error: Bearer <redacted>"
        }
      })
    }
  ]);

  assert.equal(result.ok, true);
});


test("KeyManager acceptance requires real runtime inventory evidence", () => {
  const document = fixture({
    extra: {
      keyManager: {
        active: true,
        productConnected: true,
        probedAt: 100,
        keys: [
          {
            identifier: "ControlMode",
            family: "remote_controller",
            operations: {
              canGet: true,
              canSet: true,
              canListen: false,
              canPerformAction: false
            },
            probeMode: "cache+hardware_read",
            runtimeStatus: "supported"
          },
          {
            identifier: "CameraZoomRatios",
            family: "camera",
            componentIndex: "LEFT_OR_MAIN",
            cameraLensType: "CAMERA_LENS_ZOOM",
            operations: {
              canGet: true,
              canSet: true,
              canListen: true,
              canPerformAction: false
            },
            probeMode: "cache+hardware_read",
            runtimeStatus: "unsupported_on_product"
          }
        ]
      }
    }
  });

  const result = validateEvidenceDocuments(
    [{ name: "keymanager.json", document }],
    { keyManager: true }
  );

  assert.equal(result.ok, true);
});

test("KeyManager acceptance rejects metadata-only or disconnected captures", () => {
  const document = fixture({
    extra: {
      keyManager: {
        active: true,
        productConnected: false,
        keys: [
          {
            identifier: "StartShootPhoto",
            family: "camera",
            operations: {
              canGet: false,
              canSet: false,
              canListen: false,
              canPerformAction: true
            },
            probeMode: "metadata_only",
            runtimeStatus: "disconnected"
          }
        ]
      }
    }
  });

  const result = validateEvidenceDocuments(
    [{ name: "keymanager-disconnected.json", document }],
    { keyManager: true }
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.includes(
      "keymanager-disconnected.json: keymanager_product_not_connected"
    )
  );
  assert.ok(
    result.errors.includes(
      "keymanager_acceptance_missing_supported_key"
    )
  );
  assert.ok(
    result.errors.includes(
      "keymanager_acceptance_missing_lens_scoped_key"
    )
  );
});
