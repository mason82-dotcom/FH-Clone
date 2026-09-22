import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_STICK_CENTER,
  InMemoryDrcSessionStore,
  DrcSessionManager,
  evaluateDrcGuards,
  evaluateDrcRequestGuards,
  type DrcSessionTransport
} from "./index.js";

class FakeTransport implements DrcSessionTransport {
  heartbeatsStarted = 0;
  heartbeatsStopped = 0;
  neutralCommands = 0;
  exitCalls = 0;
  stickCommands = 0;
  sequenceResets = 0;

  resetControlSequence(): void {
    this.sequenceResets += 1;
  }

  startHeartbeat(_gatewaySn: string): void {
    this.heartbeatsStarted += 1;
  }

  stopHeartbeat(): void {
    this.heartbeatsStopped += 1;
  }

  async sendStickControl(): Promise<number> {
    this.stickCommands += 1;
    return this.stickCommands;
  }

  async sendNeutralStickControl(): Promise<number> {
    this.neutralCommands += 1;
    return this.neutralCommands;
  }

  async exitDrcMode(): Promise<unknown> {
    this.exitCalls += 1;
    return {};
  }
}

const preAuthorityGuards = {
  fc3: true,
  controlLease: true,
  capability: true,
  djiAuthority: false
};

const activeGuards = {
  ...preAuthorityGuards,
  djiAuthority: true
};

test("request guards do not require DJI authority yet", () => {
  assert.deepEqual(evaluateDrcRequestGuards(preAuthorityGuards), { ok: true });
  assert.deepEqual(evaluateDrcGuards(preAuthorityGuards), {
    ok: false,
    missing: ["djiAuthority"]
  });
});

test("session follows requesting -> active -> draining -> closed", async () => {
  let now = 1_000;
  const transport = new FakeTransport();
  const store = new InMemoryDrcSessionStore(() => now);
  const audits: string[] = [];
  const manager = new DrcSessionManager(transport, store, {
    now: () => now,
    checkIntervalMs: 60_000,
    onAudit: (event) => {
      audits.push(event.event);
    }
  });

  const requesting = await manager.request({
    aircraftSn: "M4T-001",
    gatewaySn: "RC-PLUS2-001",
    guards: preAuthorityGuards
  });
  assert.equal(requesting.state, "requesting");

  await assert.rejects(
    manager.activate({
      gatewaySn: "RC-PLUS2-001",
      guards: preAuthorityGuards
    }),
    /djiAuthority/
  );

  const active = await manager.activate({
    gatewaySn: "RC-PLUS2-001",
    guards: activeGuards
  });
  assert.equal(active.state, "active");
  assert.equal(transport.heartbeatsStarted, 1);
  assert.equal(transport.sequenceResets, 1);

  now += 100;
  await manager.sendStick(
    "RC-PLUS2-001",
    {
      roll: DJI_STICK_CENTER,
      pitch: DJI_STICK_CENTER,
      throttle: DJI_STICK_CENTER,
      yaw: DJI_STICK_CENTER
    },
    activeGuards
  );
  assert.equal(transport.stickCommands, 1);

  const closed = await manager.closeGracefully(
    "RC-PLUS2-001",
    "operator_release"
  );
  assert.equal(closed.state, "closed");
  assert.equal(transport.neutralCommands, 1);
  assert.equal(transport.exitCalls, 1);
  assert.ok(audits.includes("draining"));
  assert.ok(audits.includes("neutral_sent"));
  assert.ok(audits.includes("closed"));
});

test("dead-man degrades at 500ms and closes at 2s", async () => {
  let now = 5_000;
  const transport = new FakeTransport();
  const store = new InMemoryDrcSessionStore(() => now);
  const manager = new DrcSessionManager(transport, store, {
    now: () => now,
    degradeAfterMs: 500,
    closeAfterMs: 2_000,
    checkIntervalMs: 60_000
  });

  await manager.request({
    aircraftSn: "M4T-002",
    gatewaySn: "RC-PLUS2-002",
    guards: preAuthorityGuards
  });
  await manager.activate({
    gatewaySn: "RC-PLUS2-002",
    guards: activeGuards
  });

  now += 600;
  await manager.checkDeadman("RC-PLUS2-002");
  const degraded = await manager.get("RC-PLUS2-002");
  assert.equal(degraded?.state, "active");
  assert.equal(degraded?.health, "degraded");
  assert.equal(transport.neutralCommands, 0);

  now += 1_500;
  await manager.checkDeadman("RC-PLUS2-002");
  const closed = await manager.get("RC-PLUS2-002");
  assert.equal(closed?.state, "closed");
  assert.equal(closed?.reason, "deadman_timeout");
  assert.equal(transport.neutralCommands, 1);
  assert.equal(transport.exitCalls, 1);
});

test("DJI authority loss force-closes without a neutral publish", async () => {
  let now = 10_000;
  const transport = new FakeTransport();
  const store = new InMemoryDrcSessionStore(() => now);
  const manager = new DrcSessionManager(transport, store, {
    now: () => now,
    checkIntervalMs: 60_000
  });

  await manager.request({
    aircraftSn: "M4T-003",
    gatewaySn: "RC-PLUS2-003",
    guards: preAuthorityGuards
  });
  await manager.activate({
    gatewaySn: "RC-PLUS2-003",
    guards: activeGuards
  });

  now += 50;
  const closed = await manager.reevaluateGuards("RC-PLUS2-003", {
    ...activeGuards,
    djiAuthority: false
  });

  assert.equal(closed?.state, "closed");
  assert.equal(closed?.reason, "dji_authority_lost");
  assert.equal(transport.neutralCommands, 0);
  assert.equal(transport.exitCalls, 0);
  assert.ok(transport.heartbeatsStopped >= 1);
});

test("loss of FH-Clone lease drains while DJI authority still exists", async () => {
  let now = 20_000;
  const transport = new FakeTransport();
  const store = new InMemoryDrcSessionStore(() => now);
  const manager = new DrcSessionManager(transport, store, {
    now: () => now,
    checkIntervalMs: 60_000
  });

  await manager.request({
    aircraftSn: "M4T-004",
    gatewaySn: "RC-PLUS2-004",
    guards: preAuthorityGuards
  });
  await manager.activate({
    gatewaySn: "RC-PLUS2-004",
    guards: activeGuards
  });

  const closed = await manager.reevaluateGuards("RC-PLUS2-004", {
    ...activeGuards,
    controlLease: false
  });

  assert.equal(closed?.state, "closed");
  assert.match(closed?.reason ?? "", /controlLease/);
  assert.equal(transport.neutralCommands, 1);
  assert.equal(transport.exitCalls, 1);
});
