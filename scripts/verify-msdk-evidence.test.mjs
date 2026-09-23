import assert from "node:assert/strict";
import test from "node:test";

import {
  validateEvidenceDocuments
} from "./verify-msdk-evidence.mjs";

function fixture({
  markers = [],
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
            "pairing_accepted",
            "heartbeat_established"
          ],
          controlConnected: 2
        })
      },
      {
        name: "app-restart.json",
        document: fixture({
          markers: [
            "stored_pairing_resumed",
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
            "heartbeat_established",
            "stored_pairing_resumed",
            "unpair_revocation_accepted",
            "pairing_cleared_local"
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
