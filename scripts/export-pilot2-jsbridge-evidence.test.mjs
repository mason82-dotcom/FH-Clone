import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  finalizePilot2Evidence
} from "./export-pilot2-jsbridge-evidence.mjs";

function evidence() {
  return {
    schema: "fh2.pilot2-jsbridge.v1",
    realHardware: true,
    synthetic: false,
    redacted: true,
    capturedAt: "2026-09-30T15:00:00.000Z",
    bridgePresent: true,
    platformIsVerified: true,
    platformVersion: "app=9.9.9; model=1.2.0",
    remoteControllerSnSha256: "a".repeat(64),
    aircraftSnSha256: "b".repeat(64),
    topologyPairMatch: true,
    moduleInventoryCaptured: true,
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
    thingConnected: true,
    topology: {
      gateway: {
        domain: 2,
        type: 144,
        subType: 0,
        thingVersion: "1.2.0"
      },
      aircraft: {
        domain: 0,
        type: 77,
        subType: 0,
        thingVersion: "1.2.0"
      }
    }
  };
}

test("finalizer adds CI-backed browser safety proof to redacted evidence", () => {
  const result = finalizePilot2Evidence(evidence(), {
    ok: true,
    errors: []
  });

  assert.equal(result.browserBundleSecretScanPass, true);
  assert.match(result.captureSha256, /^[a-f0-9]{64}$/);
});

test("finalizer rejects raw hardware identifiers and sensitive keys", () => {
  assert.throws(
    () =>
      finalizePilot2Evidence(
        {
          ...evidence(),
          remoteControllerSn: "RAW-RC"
        },
        { ok: true, errors: [] }
      ),
    /raw_identifier_or_sensitive_key_present/
  );

  assert.throws(
    () =>
      finalizePilot2Evidence(
        {
          ...evidence(),
          nested: { password: "must-not-exist" }
        },
        { ok: true, errors: [] }
      ),
    /raw_identifier_or_sensitive_key_present/
  );
});

test("finalizer rejects incomplete module inventory and failed safety scan", () => {
  const incomplete = evidence();
  delete incomplete.modules.mission;

  assert.throws(
    () =>
      finalizePilot2Evidence(incomplete, {
        ok: true,
        errors: []
      }),
    /module_state_missing:mission/
  );

  assert.throws(
    () =>
      finalizePilot2Evidence(evidence(), {
        ok: false,
        errors: ["forbidden_jsbridge_call:apiGetToken"]
      }),
    /browser_bundle_safety_failed/
  );
});


test("Pilot 2 evidence page is read-only and does not persist browser state", () => {
  const source = fs.readFileSync(
    "apps/web/src/pilot-evidence/PilotJsbridgeEvidence.tsx",
    "utf8"
  );

  assert.equal(source.includes("/api/dji/pilot2/evidence"), true);
  for (const forbidden of [
    "window.djiBridge",
    ".platformVerifyLicense(",
    ".platformLoadComponent(",
    ".platformUnloadComponent(",
    ".thingDisconnect(",
    ".wsConnect(",
    ".wsSend(",
    "localStorage",
    "sessionStorage",
    "console.log"
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden: ${forbidden}`);
  }
});


test("Pilot 2 evidence readiness exposes only availability, not raw identities", () => {
  const client = fs.readFileSync(
    "apps/web/src/pilot-bridge/client.ts",
    "utf8"
  );
  const page = fs.readFileSync(
    "apps/web/src/pilot-evidence/PilotJsbridgeEvidence.tsx",
    "utf8"
  );

  assert.match(
    client,
    /decodeRaw\(\s*unwrap\(\s*runtime\(\)\.platformGetVersion\(\)/
  );
  assert.equal(page.includes("Pilot-Version:"), true);
  assert.equal(page.includes("RC-Identität:"), true);
  assert.equal(page.includes("Aircraft-Identität:"), true);
  assert.equal(page.includes("readiness.remoteController ? \"verfügbar\" : \"fehlt\""), true);
  assert.equal(page.includes("readiness.aircraft ? \"verfügbar\" : \"fehlt\""), true);
});
