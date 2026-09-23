import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePilotBridgeSources
} from "./verify-pilot2-jsbridge.mjs";

const safe = `
window.djiBridge.platformIsVerified();
window.djiBridge.platformGetVersion();
window.djiBridge.platformGetRemoteControllerSN();
window.djiBridge.platformGetAircraftSN();
window.djiBridge.platformIsComponentLoaded("thing");
`;

test("read-only Pilot2 JSBridge surface passes", () => {
  const result = validatePilotBridgeSources([
    { name: "client.ts", content: safe }
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("credential and write capable bridge calls are rejected", () => {
  const result = validatePilotBridgeSources([
    {
      name: "unsafe.ts",
      content:
        safe +
        "\nwindow.djiBridge.thingConnect(user, password, callback);" +
        "\nwindow.djiBridge.apiGetToken();" +
        "\nwindow.djiBridge.liveshareStartLive();"
    }
  ]);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.includes("forbidden_jsbridge_call:thingConnect")
  );
  assert.ok(
    result.errors.includes("forbidden_jsbridge_call:apiGetToken")
  );
  assert.ok(
    result.errors.includes(
      "forbidden_jsbridge_call:liveshareStartLive"
    )
  );
});

test("Vite browser secret variables are rejected", () => {
  const result = validatePilotBridgeSources([
    { name: "client.ts", content: safe },
    {
      name: ".env.example",
      content: "VITE_DJI_JSBRIDGE_APP_KEY=secret"
    }
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("forbidden_vite_secret"));
});
