import assert from "node:assert/strict";
import test from "node:test";
import type { DrcSessionGuards } from "@fh-clone/adapter-dji-cloud";
import { ControlCoordinator } from "./control-coordinator.js";

function fixture(authorized = true) {
  const calls: string[] = [];
  const guards: DrcSessionGuards = {
    fc3: true,
    controlLease: true,
    capability: true,
    djiAuthority: false
  };
  const sessions = {
    async listOpenSessions() { return []; },
    async request() { calls.push("session.request"); return {} as never; },
    async markAuthorized() { calls.push("session.authorized"); return {} as never; },
    async markAuthorityGrabbed() { calls.push("session.authorityGrabbed"); return {} as never; },
    async markDrcModeActive() { calls.push("session.drcModeActive"); return {} as never; },
    async activate() { calls.push("session.activate"); return { state: "drc_mode_active" } as never; },
    async getDrcStatus(): Promise<0 | 1 | 2 | "unknown"> {
      calls.push("session.drcStatus");
      return 2;
    },
    async setTransportConnected() { calls.push("session.transportConnected"); return {} as never; },
    async closeGracefully() { calls.push("session.close"); return { state: "closed" } as never; },
    async forceClose() { calls.push("session.forceClose"); return { state: "closed" } as never; }
  };
  const dji = {
    resolveGatewaySn: () => "RC-PLUS2-001",
    supportsFlightControl: () => true,
    async connectDrcTransport() { calls.push("transport.connect"); },
    async disconnectDrcTransport() { calls.push("transport.disconnect"); },
    pilotAuthority: {
      async requestFlightAuthority() {
        calls.push("authority.request");
        if (!authorized) {
          throw new Error(
            "Pilot cloud-control authorization ended with status timeout"
          );
        }
        guards.djiAuthority = true;
        return {};
      },
      async releaseFlightAuthority() {
        calls.push("authority.release");
        guards.djiAuthority = false;
        return {};
      }
    },
    drc: { async enterDrcMode() { calls.push("drc.enter"); } }
  };
  return { calls, guards, sessions, dji };
}

test("start orders authority before DRC activation", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(
    f.dji,
    f.sessions as never,
    () => f.guards,
    { authorityTimeoutMs: 20 }
  );
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: 1, enable_tls: false } }
  });
  assert.deepEqual(f.calls, [
    "session.request", "authority.request", "session.authorized",
    "session.authorityGrabbed", "drc.enter", "session.drcModeActive",
    "transport.connect", "session.transportConnected", "session.activate"
  ]);
});

test("authority timeout force-closes and releases authority", async () => {
  const f = fixture(false);
  const coordinator = new ControlCoordinator(
    f.dji,
    f.sessions as never,
    () => f.guards,
    { authorityTimeoutMs: 2 }
  );
  await assert.rejects(
    coordinator.start({
      aircraftSn: "M4T-001",
      holder: "operator-a",
      authority: { userId: "u1", userCallsign: "OP-A" },
      drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: 1, enable_tls: false } }
    }),
    /status timeout/
  );
  assert.deepEqual(f.calls, ["session.request", "authority.request", "session.forceClose", "transport.disconnect", "authority.release"]);
});

test("normal stop drains before authority release", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards);
  await coordinator.stop("M4T-001");
  assert.deepEqual(f.calls, ["session.close", "transport.disconnect", "authority.release"]);
});


test("branch A reconnects only with fresh active DRC status and valid runtime guards", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards, {
    credentialSafetyWindowS: 15
  });
  const expire = Math.floor(Date.now() / 1000) + 120;
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: expire, enable_tls: false } }
  });
  f.calls.length = 0;
  assert.equal(await coordinator.recoverTransport("M4T-001"), true);
  assert.deepEqual(f.calls, ["session.drcStatus", "transport.connect", "session.transportConnected"]);
});

test("branch A stays fail-closed when runtime guards are lost", async () => {
  const f = fixture(true);
  let current = f.guards;
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => current);
  const expire = Math.floor(Date.now() / 1000) + 120;
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: expire, enable_tls: false } }
  });
  f.calls.length = 0;
  current = { ...current, controlLease: false };
  assert.equal(await coordinator.recoverTransport("M4T-001"), false);
  assert.deepEqual(f.calls, []);
});

test("branch A rejects stale or inactive DJI DRC status", async () => {
  const f = fixture(true);
  f.sessions.getDrcStatus = async () => { f.calls.push("session.drcStatus"); return "unknown"; };
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards);
  const expire = Math.floor(Date.now() / 1000) + 120;
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: expire, enable_tls: false } }
  });
  f.calls.length = 0;
  assert.equal(await coordinator.recoverTransport("M4T-001"), false);
  assert.deepEqual(f.calls, ["session.drcStatus"]);
});

test("branch A rejects credentials inside the expiry safety window", async () => {
  const f = fixture(true);
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards, {
    credentialSafetyWindowS: 15
  });
  const expire = Math.floor(Date.now() / 1000) + 10;
  await coordinator.start({
    aircraftSn: "M4T-001",
    holder: "operator-a",
    authority: { userId: "u1", userCallsign: "OP-A" },
    drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: expire, enable_tls: false } }
  });
  f.calls.length = 0;
  assert.equal(await coordinator.recoverTransport("M4T-001"), false);
  assert.deepEqual(f.calls, ["session.drcStatus"]);
});


test("rejects a second gateway while the singleton DRC transport is in use", async () => {
  const f = fixture(true);
  f.sessions.listOpenSessions = async () => [{ gatewaySn: "RC-PLUS2-OTHER" }] as never;
  const coordinator = new ControlCoordinator(f.dji, f.sessions as never, () => f.guards);
  await assert.rejects(
    coordinator.start({
      aircraftSn: "M4T-001",
      holder: "operator-a",
      authority: { userId: "u1", userCallsign: "OP-A" },
      drc: { mqttBroker: { address: "mqtt://broker", client_id: "drc", username: "u", password: "p", expire_time: Math.floor(Date.now() / 1000) + 120, enable_tls: false } }
    }),
    /drc_session_already_active/
  );
  assert.deepEqual(f.calls, []);
});
