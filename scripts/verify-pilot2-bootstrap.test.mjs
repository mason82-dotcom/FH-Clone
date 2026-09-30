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
    "localStorage",
    "sessionStorage",
    "VITE_DJI_APP_KEY",
    "VITE_DJI_APP_LICENSE",
    "VITE_DJI_MQTT_PASSWORD",
    "VITE_PILOT_TOKEN",
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


test("Pilot 2 bootstrap preserves the native Thing module when leaving the menu", () => {
  assert.equal(source.includes('.onBackClick = () => false'), true);
  assert.equal(source.includes('.platformIsComponentLoaded("thing")'), true);
  assert.equal(source.includes('.thingGetConnectState()'), true);

  for (const forbidden of [
    ".thingDisconnect(",
    ".platformUnloadComponent(",
    ".platformStopSelf("
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `menu-exit path must not contain ${forbidden}`
    );
  }
});

test("Pilot 2 bootstrap restores connected UI state when re-entering the WebView", () => {
  assert.match(
    source,
    /const thingConnected = thingLoaded[\s\S]*?thingGetConnectState\(\)/
  );
  assert.match(
    source,
    /if \(thingConnected\)[\s\S]*?setStage\("connected"\)/
  );
});


test("Pilot 2 bootstrap registers a non-secret workspace after MQTT connect", () => {
  assert.equal(source.includes(".platformSetWorkspaceId("), true);
  assert.equal(source.includes(".platformSetInformation("), true);
  assert.equal(source.includes("VITE_DJI_PILOT_WORKSPACE_ID"), true);
  assert.match(source, /UUID_PATTERN/);
});

test("Pilot 2 bootstrap no longer claims menu-exit persistence before hardware proof", () => {
  assert.equal(
    source.includes("Die Verbindung bleibt beim Verlassen dieses Menüs aktiv."),
    false
  );
  assert.equal(
    source.includes("Persistenz nach Wechsel in die"),
    true
  );
});
