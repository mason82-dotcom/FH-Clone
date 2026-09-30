import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "apps/web/src/pilot-bootstrap/PilotCloudBootstrap.tsx",
  "utf8"
);
const appSource = fs.readFileSync(
  "apps/web/src/App.tsx",
  "utf8"
);
const evidenceSource = fs.readFileSync(
  "apps/web/src/pilot-evidence/PilotJsbridgeEvidence.tsx",
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


test("Pilot 2 bootstrap registers a non-secret workspace for the cloud session", () => {
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


test("Pilot 2 bootstrap configures workspace before loading the Thing module", () => {
  const workspaceIndex = source.indexOf("configurePilotWorkspace(bridge);", source.indexOf("async function connect"));
  const thingLoadIndex = source.indexOf('bridge.platformLoadComponent(', source.indexOf("async function connect"));
  assert.notEqual(workspaceIndex, -1, "workspace configuration call missing");
  assert.notEqual(thingLoadIndex, -1, "Thing load call missing");
  assert.ok(
    workspaceIndex < thingLoadIndex,
    "DJI workspace/platform info must be configured before platformLoadComponent(thing)"
  );
});


test("Pilot 2 bootstrap exposes evidence navigation whenever JSBridge is available", () => {
  assert.match(
    source,
    /\{bridgeAvailable && \([\s\S]*?<a href="\/pilot-evidence">/
  );
  assert.equal(
    /\{stage === "connected" && \([\s\S]*?<a href="\/pilot-evidence">/.test(source),
    false,
    "Evidence navigation must not depend on an active MQTT link"
  );
});


test("Pilot 2 bootstrap loads Wayline API and mission modules only after explicit action", () => {
  assert.match(
    source,
    /platformLoadComponent\(\s*"api"[\s\S]*?host:\s*normalizedHost[\s\S]*?token:\s*waylineApiToken/
  );
  assert.match(
    source,
    /platformLoadComponent\(\s*"mission",\s*JSON\.stringify\(\{\}\)/
  );
  assert.equal(source.includes('platformLoadComponent("ws"'), false);
  assert.equal(source.includes(".wsConnect("), false);
});

test("Pilot 2 Wayline token is never embedded or persisted", () => {
  assert.equal(source.includes("VITE_DJI_PILOT_WAYLINE_TOKEN"), false);
  assert.equal(source.includes("VITE_DJI_PILOT_AUTH_TOKEN"), false);
  assert.equal(/waylineApiToken\s*=\s*useState\(\s*"[^"]+"/.test(source), false);
  assert.equal(source.includes('setWaylineApiToken("");'), true);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
});

test("Pilot 2 Wayline API defaults to the current same origin", () => {
  assert.equal(source.includes("window.location.origin"), true);
  assert.equal(source.includes("/^https?:\\/\\//i"), true);
});


test("Pilot evidence navigation preserves the current DJI WebView document", () => {
  assert.equal(source.includes("event.preventDefault()"), true);
  assert.equal(source.includes("onOpenEvidence();"), true);
  assert.equal(appSource.includes('window.history.pushState({}, "", path)'), true);
  assert.equal(appSource.includes('window.addEventListener("popstate"'), true);
  assert.equal(
    appSource.includes('onOpenEvidence={() => navigate("/pilot-evidence")}'),
    true
  );
});

test("Pilot evidence page surfaces the concrete JSBridge diagnostic", () => {
  assert.equal(evidenceSource.includes("<strong>JSBridge-Fehler:</strong>"), true);
  assert.equal(evidenceSource.includes("{pilot.error}"), true);
});
