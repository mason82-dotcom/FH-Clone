import assert from "node:assert/strict";
import test from "node:test";

import type {
  MsdkAgentRecord,
  MsdkBridgeSnapshot
} from "./msdk-bridge.js";
import {
  MsdkControlHub,
  type MsdkControlPeer
} from "./msdk-control.js";

function snapshot(
  armed = true,
  virtualStick = true
): MsdkBridgeSnapshot {
  return {
    schema: "fh2.msdk.v1",
    timestampMs: 10_000,
    sdk: {
      registered: true,
      productConnected: true
    },
    gateway: {
      connected: true,
      serialNumber: "RC-PRO-001"
    },
    aircraft: {
      flightControllerConnected: true,
      productType: "M3T",
      flightControllerSerial: "M3T-001"
    },
    sensors: [],
    rtk: {},
    control: {
      networkArmed: armed,
      networkArmedAt: armed ? 9_000 : null,
      virtualStick: {
        enabled: false,
        authorityOwner: "UNKNOWN"
      }
    },
    capabilities: {
      virtualStick
    }
  };
}

class FakePeer implements MsdkControlPeer {
  readonly sent: Record<string, unknown>[] = [];
  closed?: { code: number; reason: string };

  send(text: string): boolean {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
    return true;
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
}

function fixture(expiresAt = 60_000) {
  let now = 10_000;
  let fc3 = true;
  let lease = true;
  let agent: MsdkAgentRecord | undefined = {
    gatewaySn: "RC-PRO-001",
    aircraftSn: "M3T-001",
    pairedAt: 9_000,
    lastSeenAt: 10_000,
    snapshot: snapshot()
  };

  const hub = new MsdkControlHub({
    getAgent: () => agent,
    hasFc3: () => fc3,
    hasLease: () => lease,
    now: () => now,
    agentFreshMs: 3_000,
    startTimeoutMs: 5_000,
    frameSilenceTimeoutMs: 2_000
  });

  const peer = new FakePeer();
  hub.registerPeer(
    {
      gatewaySn: "RC-PRO-001",
      aircraftSn: "M3T-001",
      expiresAt
    },
    peer
  );

  return {
    hub,
    peer,
    setNow(value: number) {
      now = value;
    },
    setFc3(value: boolean) {
      fc3 = value;
    },
    setLease(value: boolean) {
      lease = value;
    },
    setAgent(value: MsdkAgentRecord | undefined) {
      agent = value;
    }
  };
}

test("opens only after local arm, FC3 and lease are present", () => {
  const f = fixture();

  const session = f.hub.openSession("M3T-001", "operator-a");
  assert.equal(session.state, "starting");
  assert.equal(f.peer.sent[0]?.type, "session_start");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  assert.equal(f.hub.getSession("M3T-001")?.state, "active");
});

test("rejects session when Android local arm is off", () => {
  const f = fixture();
  f.setAgent({
    gatewaySn: "RC-PRO-001",
    aircraftSn: "M3T-001",
    pairedAt: 9_000,
    lastSeenAt: 10_000,
    snapshot: snapshot(false)
  });

  assert.throws(
    () => f.hub.openSession("M3T-001", "operator-a"),
    /msdk_network_control_not_armed/
  );
});

test("sends monotonic short-lived normalized stick frames", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  const seq = f.hub.sendStick(
    "M3T-001",
    "operator-a",
    {
      leftHorizontal: 0.1,
      leftVertical: -0.2,
      rightHorizontal: 0.3,
      rightVertical: -0.4
    }
  );

  assert.equal(seq, 1);
  const frame = f.peer.sent.at(-1);
  assert.equal(frame?.type, "stick");
  assert.equal(frame?.seq, 1);
  assert.equal(frame?.expiresAt, 10_250);
});

test("guard loss emits neutral before session_stop", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.setFc3(false);
  f.hub.tick();

  const tail = f.peer.sent.slice(-2).map((entry) => entry.type);
  assert.deepEqual(tail, ["neutral", "session_stop"]);
  assert.equal(f.hub.getSession("M3T-001")?.state, "closed");
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "fc3_required"
  );
});

test("stale heartbeat closes an active session fail-closed", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.setNow(13_001);
  f.hub.tick();

  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "msdk_agent_stale"
  );
  assert.deepEqual(
    f.peer.sent.slice(-2).map((entry) => entry.type),
    ["neutral", "session_stop"]
  );
});

test("replacing the agent socket closes an active session fail-closed", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  const replacement = new FakePeer();
  f.hub.registerPeer(
    {
      gatewaySn: "RC-PRO-001",
      aircraftSn: "M3T-001",
      expiresAt: 60_000
    },
    replacement
  );

  assert.deepEqual(
    f.peer.sent.slice(-2).map((entry) => entry.type),
    ["neutral", "session_stop"]
  );
  assert.deepEqual(
    f.peer.closed,
    { code: 4001, reason: "replaced_by_new_agent_connection" }
  );
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "agent_transport_replaced"
  );
});

test("expired transport token closes session and socket", () => {
  const f = fixture(10_100);
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.setNow(10_101);
  f.hub.tick();

  assert.deepEqual(
    f.peer.sent.slice(-2).map((entry) => entry.type),
    ["neutral", "session_stop"]
  );
  assert.deepEqual(
    f.peer.closed,
    { code: 4003, reason: "agent_token_expired" }
  );
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "agent_token_expired"
  );
  assert.throws(
    () => f.hub.openSession("M3T-001", "operator-a"),
    /msdk_agent_socket_not_connected/
  );
});

test("explicit unpair closes control session and transport fail-closed", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.hub.disconnectAgent("M3T-001", "agent_unpaired");

  assert.deepEqual(
    f.peer.sent.slice(-2).map((entry) => entry.type),
    ["neutral", "session_stop"]
  );
  assert.deepEqual(
    f.peer.closed,
    { code: 4004, reason: "agent_unpaired" }
  );
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "agent_unpaired"
  );
  assert.throws(
    () => f.hub.openSession("M3T-001", "operator-a"),
    /msdk_agent_socket_not_connected/
  );
});

test("wrong lease holder cannot inject stick frames", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  assert.throws(
    () =>
      f.hub.sendStick(
        "M3T-001",
        "operator-b",
        {
          leftHorizontal: 0,
          leftVertical: 0,
          rightHorizontal: 0,
          rightVertical: 0
        }
      ),
    /msdk_control_lease_holder_mismatch/
  );
});


test("backend frame dead-man closes an active session after 2 seconds", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");
  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.setNow(11_999);
  f.hub.tick();
  assert.equal(f.hub.getSession("M3T-001")?.state, "active");

  f.setNow(12_000);
  f.hub.tick();

  assert.equal(f.hub.getSession("M3T-001")?.state, "closed");
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "stick_frame_timeout"
  );
  assert.deepEqual(
    f.peer.sent.slice(-2).map((entry) => entry.type),
    ["neutral", "session_stop"]
  );
});

test("stick traffic refreshes backend frame dead-man", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");
  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.setNow(11_900);
  f.hub.sendStick("M3T-001", "operator-a", {
    leftHorizontal: 0,
    leftVertical: 0,
    rightHorizontal: 0,
    rightVertical: 0
  });

  f.setNow(13_899);
  f.hub.tick();
  assert.equal(f.hub.getSession("M3T-001")?.state, "active");

  f.setNow(13_900);
  f.hub.tick();
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "stick_frame_timeout"
  );
});

test("agent dead-man notification closes backend session immediately", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");
  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_stopped",
      sessionId: session.sessionId,
      reason: "local_deadman_timeout"
    })
  );

  assert.equal(f.hub.getSession("M3T-001")?.state, "closed");
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "local_deadman_timeout"
  );
});

test("failed stop signaling still closes backend session locally", () => {
  const f = fixture();
  const session = f.hub.openSession("M3T-001", "operator-a");
  f.hub.handleAgentMessage(
    "M3T-001",
    JSON.stringify({
      type: "session_ready",
      sessionId: session.sessionId,
      authorityOwner: "MSDK"
    })
  );

  f.peer.send = () => false;
  assert.doesNotThrow(() =>
    f.hub.closeSession("M3T-001", "test_signal_failure")
  );
  assert.equal(f.hub.getSession("M3T-001")?.state, "closed");
  assert.equal(
    f.hub.getSession("M3T-001")?.reason,
    "test_signal_failure"
  );
});
