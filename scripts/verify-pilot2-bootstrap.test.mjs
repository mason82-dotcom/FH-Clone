import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "apps/web/src/pilot-bootstrap/PilotCloudBootstrap.tsx",
  "utf8"
);

test("Pilot 2 bootstrap uses only the reviewed cloud-connect JSBridge calls", () => {
  for (const required of [
    ".platformVerifyLicense(",
    ".platformLoadComponent(",
    ".platformIsVerified(",
    ".platformGetRemoteControllerSN(",
    ".thingGetConnectState("
  ]) {
    assert.equal(source.includes(required), true, `missing ${required}`);
  }

  for (const forbidden of [
    ".thingDisconnect(",
    ".wsConnect(",
    ".wsSend(",
    ".liveshareStartLive(",
    ".platformSetWorkspaceId(",
    ".platformSetInformation(",
    "localStorage",
    "sessionStorage",
    "VITE_DJI",
    "VITE_PILOT",
    "fetch(",
    "axios"
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden ${forbidden}`);
  }
});

test("Pilot 2 bootstrap does not embed an MQTT password or DJI license value", () => {
  assert.equal(/mqttPassword\s*=\s*useState\(\s*"[^"]+"/.test(source), false);
  assert.equal(/license\s*=\s*useState\(\s*"[^"]+"/.test(source), false);
  assert.equal(/appKey\s*=\s*useState\(\s*"[^"]+"/.test(source), false);
});

test("Pilot 2 bootstrap requires tcp:// or ws:// broker URLs", () => {
  assert.match(source, /\^\(tcp\|ws\):/);
});


test("Pilot 2 bootstrap trims surrounding Cloud API text fields before verification", () => {
  for (const required of [
    "appId.trim()",
    "appKey.trim()",
    "license.trim()",
    "mqttHost.trim()",
    "mqttUsername.trim()"
  ]) {
    assert.equal(source.includes(required), true, `missing normalization: ${required}`);
  }

  assert.equal(
    source.includes("mqttPassword.trim()"),
    false,
    "MQTT passwords must not be modified"
  );
});

test("Pilot 2 bootstrap keeps DJI portal values direct and never Base64-transforms them", () => {
  assert.equal(source.includes("btoa("), false);
  assert.equal(source.includes("atob("), false);
  assert.match(
    source,
    /platformVerifyLicense\(\s*normalizedAppId,\s*normalizedAppKey,\s*normalizedLicense\s*\)/
  );
});
