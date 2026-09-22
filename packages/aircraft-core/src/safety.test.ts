import assert from "node:assert/strict";
import test from "node:test";

import { SafetyGate, classifyCapability } from "./safety.js";
import type { AircraftCommand } from "./types.js";

function command(
  capability: AircraftCommand["capability"] = "control.flight"
): AircraftCommand {
  return {
    deviceId: "AIRCRAFT-1",
    capability,
    method: "test",
    correlationId: "corr-1",
    timeoutMs: 1_000
  };
}

test("SafetyGate starts in FC0", () => {
  const gate = new SafetyGate();
  assert.equal(gate.currentStage, "FC0");
  assert.equal(gate.isKillSwitchActive, false);
});

test("flight control requires FC3 and is denied at FC0", () => {
  const gate = new SafetyGate();
  const result = gate.authorize(command("control.flight"), 1);

  assert.equal(result.allowed, false);
  assert.equal(result.requiredStage, "FC3");
  assert.equal(result.risk, "DANGEROUS");
});

test("camera control requires FC1", () => {
  assert.deepEqual(classifyCapability("control.camera"), {
    stage: "FC1",
    risk: "CONTROLLED_WRITE"
  });
});

test("kill switch denies flight control even at FC3", () => {
  const gate = new SafetyGate();
  gate.setStage("FC3");
  gate.setKillSwitch(true);

  const result = gate.authorize(command("control.flight"), 1);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /kill switch/i);
});

test("FC3 permits flight control only while kill switch is inactive", () => {
  const gate = new SafetyGate();
  gate.setStage("FC3");

  assert.equal(gate.authorize(command("control.flight"), 1).allowed, true);

  gate.setKillSwitch(true);
  assert.equal(gate.authorize(command("control.flight"), 2).allowed, false);
});

test("invalid timeout and correlation id fail closed", () => {
  const gate = new SafetyGate();
  gate.setStage("FC3");

  assert.equal(
    gate.authorize({ ...command(), timeoutMs: 0 }, 1).allowed,
    false
  );
  assert.equal(
    gate.authorize({ ...command(), correlationId: "   " }, 1).allowed,
    false
  );
});
