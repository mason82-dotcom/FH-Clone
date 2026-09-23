import assert from "node:assert/strict";
import test from "node:test";

import { evaluateControlApiReadiness } from "./readiness.js";

function disabled() {
  return { configured: false, ready: false };
}

function ready() {
  return { configured: true, ready: true };
}

function unavailable() {
  return { configured: true, ready: false };
}

test("optional disabled dependencies do not make readiness fail", () => {
  const result = evaluateControlApiReadiness({
    mqttBackend: disabled(),
    topologyStore: disabled(),
    gatewayCredentialStore: disabled(),
    missionStore: disabled()
  });

  assert.equal(result.ready, true);
  assert.equal(result.checks.mqttBackend.state, "disabled");
  assert.equal(result.checks.topologyStore.state, "disabled");
});

test("configured but disconnected MQTT is not ready", () => {
  const result = evaluateControlApiReadiness({
    mqttBackend: unavailable(),
    topologyStore: disabled(),
    gatewayCredentialStore: disabled(),
    missionStore: disabled()
  });

  assert.equal(result.ready, false);
  assert.equal(result.checks.mqttBackend.state, "unavailable");
});

test("configured persistence must actually be reachable", () => {
  const result = evaluateControlApiReadiness({
    mqttBackend: ready(),
    topologyStore: ready(),
    gatewayCredentialStore: unavailable(),
    missionStore: ready()
  });

  assert.equal(result.ready, false);
  assert.equal(
    result.checks.gatewayCredentialStore.state,
    "unavailable"
  );
});

test("fully configured runtime is ready only when every required dependency is ready", () => {
  const result = evaluateControlApiReadiness({
    mqttBackend: ready(),
    topologyStore: ready(),
    gatewayCredentialStore: ready(),
    missionStore: ready()
  });

  assert.equal(result.ready, true);
  assert.deepEqual(
    Object.values(result.checks).map((check) => check.state),
    ["ready", "ready", "ready", "ready"]
  );
});
