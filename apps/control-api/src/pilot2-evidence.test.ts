import assert from "node:assert/strict";
import test from "node:test";

import {
  createPilot2JsbridgeEvidence,
  parsePilot2EvidenceCapture
} from "./pilot2-evidence.js";

const topology = [
  {
    gatewaySn: "RC-REAL-SECRET",
    product: {
      domain: 2,
      type: 144,
      subType: 0,
      thingVersion: "1.2.0"
    },
    subDevices: [
      {
        sn: "AIRCRAFT-REAL-SECRET",
        index: "A",
        product: {
          domain: 0,
          type: 77,
          subType: 0,
          thingVersion: "1.2.0"
        }
      }
    ],
    updatedAt: 1
  }
];

function capture() {
  return {
    bridgePresent: true,
    platformIsVerified: true,
    version: {
      appVersion: "9.9.9",
      modelVersion: "1.2.0"
    },
    remoteControllerSn: "RC-REAL-SECRET",
    aircraftSn: "AIRCRAFT-REAL-SECRET",
    modules: {
      thing: true,
      liveshare: false,
      api: false,
      ws: false,
      map: false,
      tsa: false,
      media: false,
      mission: false
    },
    thingConnected: true
  };
}

test("parses a complete real Pilot 2 snapshot", () => {
  const parsed = parsePilot2EvidenceCapture(capture());
  assert.ok(parsed);
  assert.equal(parsed.remoteControllerSn, "RC-REAL-SECRET");
  assert.equal(parsed.aircraftSn, "AIRCRAFT-REAL-SECRET");
  assert.equal(parsed.modules.thing, true);
});

test("requires verified bridge, identities, version and complete module inventory", () => {
  assert.equal(
    parsePilot2EvidenceCapture({
      ...capture(),
      platformIsVerified: false
    }),
    undefined
  );

  const incomplete = capture();
  delete (incomplete.modules as Partial<typeof incomplete.modules>).mission;
  assert.equal(parsePilot2EvidenceCapture(incomplete), undefined);
});

test("creates redacted evidence with exact topology match and no raw identifiers", () => {
  const parsed = parsePilot2EvidenceCapture(capture());
  assert.ok(parsed);

  const evidence = createPilot2JsbridgeEvidence(
    parsed,
    topology,
    "2026-09-30T15:00:00.000Z"
  );

  assert.equal(evidence.schema, "fh2.pilot2-jsbridge.v1");
  assert.equal(evidence.realHardware, true);
  assert.equal(evidence.synthetic, false);
  assert.equal(evidence.redacted, true);
  assert.equal(evidence.topologyPairMatch, true);
  assert.equal(evidence.platformVersion, "app=9.9.9; model=1.2.0");
  assert.match(evidence.remoteControllerSnSha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.aircraftSnSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.topology.gateway.type, 144);
  assert.equal(evidence.topology.aircraft.type, 77);

  const encoded = JSON.stringify(evidence);
  assert.equal(encoded.includes("RC-REAL-SECRET"), false);
  assert.equal(encoded.includes("AIRCRAFT-REAL-SECRET"), false);
});

test("rejects a bridge identity pair that is not the current FH2 topology pair", () => {
  const parsed = parsePilot2EvidenceCapture({
    ...capture(),
    aircraftSn: "OTHER-AIRCRAFT"
  });
  assert.ok(parsed);

  assert.throws(
    () => createPilot2JsbridgeEvidence(parsed, topology),
    /pilot2_topology_pair_mismatch/
  );
});
