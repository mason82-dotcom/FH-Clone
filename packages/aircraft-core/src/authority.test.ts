import assert from "node:assert/strict";
import test from "node:test";

import {
  CapabilityRouter,
  CommandCoordinator,
  ControlAuthority
} from "./authority.js";
import { SafetyGate } from "./safety.js";
import type {
  AdapterDevice,
  AircraftAdapter,
  AircraftCommand,
  CommandResult
} from "./types.js";

class FakeAdapter implements AircraftAdapter {
  readonly id = "fake";
  executions = 0;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async listDevices(): Promise<AdapterDevice[]> {
    return [];
  }
  async execute(_command: AircraftCommand): Promise<CommandResult> {
    this.executions += 1;
    return { ok: true };
  }
}

function device(): AdapterDevice {
  return {
    identity: { id: "AIRCRAFT-1", vendor: "test" },
    adapterId: "fake",
    capabilities: ["control.flight"],
    connected: true,
    lastSeenAt: 1
  };
}

function flightCommand(): AircraftCommand {
  return {
    deviceId: "AIRCRAFT-1",
    capability: "control.flight",
    method: "stick",
    correlationId: "corr-1",
    timeoutMs: 1_000
  };
}

test("ControlAuthority rejects expired leases", () => {
  const authority = new ControlAuthority();

  assert.equal(
    authority.acquire(
      {
        deviceId: "AIRCRAFT-1",
        adapterId: "fake",
        owner: "operator-a",
        expiresAt: 1_000
      },
      1_000
    ),
    false
  );
});

test("ControlAuthority prevents another owner from stealing an active lease", () => {
  const authority = new ControlAuthority();

  assert.equal(
    authority.acquire(
      {
        deviceId: "AIRCRAFT-1",
        adapterId: "fake",
        owner: "operator-a",
        expiresAt: 2_000
      },
      1_000
    ),
    true
  );

  assert.equal(
    authority.acquire(
      {
        deviceId: "AIRCRAFT-1",
        adapterId: "fake",
        owner: "operator-b",
        expiresAt: 3_000
      },
      1_100
    ),
    false
  );
});

test("expired lease is not returned", () => {
  const authority = new ControlAuthority();
  authority.acquire(
    {
      deviceId: "AIRCRAFT-1",
      adapterId: "fake",
      owner: "operator-a",
      expiresAt: 2_000
    },
    1_000
  );

  assert.equal(authority.get("AIRCRAFT-1", 2_000), undefined);
});

test("CommandCoordinator requires SafetyGate and matching lease owner", async () => {
  const adapter = new FakeAdapter();
  const authority = new ControlAuthority();
  const safety = new SafetyGate();
  const router = new CapabilityRouter(
    new Map<string, AircraftAdapter>([[adapter.id, adapter]]),
    () => [device()]
  );
  const coordinator = new CommandCoordinator(authority, router, safety);

  authority.acquire(
    {
      deviceId: "AIRCRAFT-1",
      adapterId: "fake",
      owner: "operator-a",
      expiresAt: 5_000
    },
    1_000
  );

  const fc0 = await coordinator.execute("operator-a", flightCommand(), 1_100);
  assert.equal(fc0.ok, false);
  assert.equal(adapter.executions, 0);

  safety.setStage("FC3");

  const wrongOwner = await coordinator.execute(
    "operator-b",
    flightCommand(),
    1_200
  );
  assert.equal(wrongOwner.ok, false);
  assert.equal(adapter.executions, 0);

  const allowed = await coordinator.execute(
    "operator-a",
    flightCommand(),
    1_300
  );
  assert.equal(allowed.ok, true);
  assert.equal(adapter.executions, 1);

  safety.setKillSwitch(true);
  const killed = await coordinator.execute(
    "operator-a",
    flightCommand(),
    1_400
  );
  assert.equal(killed.ok, false);
  assert.equal(adapter.executions, 1);
});
