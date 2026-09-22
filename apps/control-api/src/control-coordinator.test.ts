import assert from "node:assert/strict";
import test from "node:test";
import type { DrcSessionGuards } from "@fh-clone/adapter-dji-cloud";
import { ControlCoordinator } from "./control-coordinator.js";

function fixture(authorized = true) {
  const calls: string[] = [];
  const guards: DrcSessionGuards = { fc3: true, controlLease: true, capability: true, djiAuthority: authorized };
  const sessions = {
    async request() { calls.push("session.request"); return {} as never; },
    async markAuthorized() { calls.push("session.authorized"); return {} as never; },
    async markAuthorityGrabbed() { calls.push("session.authorityGrabbed"); return {} as never; },
    async markDrcModeActive() { calls.push("session.drcModeActive"); return {} as never; },
    async activate() { calls.push("session.activate"); return { state: "drc_mode_active" } as never; },
    async closeGracefully() { calls.push("session.close"); return { state: "closed" } as never; },
    async forceClose() { calls.push("session.forceClose"); return { state: "closed" } as never; }
  };
  const dji = {
    resolveGatewaySn: () => "RC-PLUS2-001",
    supportsFlightControl: () => true,
    isCloudControlAuthorized: () => authorized,
    async connectDrcTransport() { calls.push("transport.connect"); },
    async disconnectDrcTransport() { calls.push("transport.disconnect"); },
    drc: {
      async requestCloudControlAuthority() { calls.push("authority.request"); },
      async releaseCloudControlAuthority() { calls.push("authority.release"); },
      async enterDrcMode() { calls.push("drc.enter"); }
    }
  };
  return { calls, guards, sessions, dji };
}

test("start orders authority before DRC activation", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(
    f.dji,
    f.sessions as never,
    () => f.guards,
    { authorityTimeoutMs: 20, authorityPollMs: 1 }
  );
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: 1, enable_tls: false } }
  });
  assert.deepEqual(f.calls, [
    "session.request", "authority.request", "session.authorized",
    "session.authorityGrabbed", "drc.enter", "transport.connect",
    "session.drcModeActive", "session.activate"
  ]);
});

test("authority timeout force-closes and releases authority", async () => {
  const f = fixture(false);
  const coordinator = new ControlCoordinator(
    f.dji,
    f.sessions as never,
    () => f.guards,
    { authorityTimeoutMs: 2, authorityPollMs: 1 }
  );
  await assert.rejects(
    coordinator.start({
      aircraftSn: "M4T-001",
      holder: "operator-a",
      authority: { userId: "u1", userCallsign: "OP-A" },
      drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: 1, enable_tls: false } }
    }),
    /authority_timeout/
  );
  assert.deepEqual(f.calls, ["session.request", "authority.request", "session.forceClose", "transport.disconnect", "authority.release"]);
});

test("normal stop drains before authority release", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards);
  await coordinator.stop("M4T-001");
  assert.deepEqual(f.calls, ["session.close", "transport.disconnect", "authority.release"]);
});
