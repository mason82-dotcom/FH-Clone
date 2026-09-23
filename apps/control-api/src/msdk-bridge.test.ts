import assert from "node:assert/strict";
import test from "node:test";

import {
  MsdkBridgeService,
  isMsdkBridgeSnapshot,
  type MsdkBridgeSnapshot
} from "./msdk-bridge.js";

function snapshot(
  gatewaySn = "RC-PRO-001",
  aircraftSn = "M3T-001"
): MsdkBridgeSnapshot {
  return {
    schema: "fh2.msdk.v1",
    timestampMs: 1_000,
    sdk: {
      registered: true,
      productConnected: true
    },
    gateway: {
      connected: true,
      serialNumber: gatewaySn,
      firmwareVersion: "01.02.0300"
    },
    aircraft: {
      flightControllerConnected: true,
      productType: "M3T",
      flightControllerSerial: aircraftSn
    },
    sensors: [],
    rtk: {},
    control: {
      enabled: false,
      authorityOwner: "UNKNOWN"
    },
    capabilities: {
      camera: true,
      gimbal: true,
      thermal: true,
      multispectral: false,
      rtk: true,
      virtualStick: true
    }
  };
}

test("validates fh2.msdk.v1 snapshots", () => {
  assert.equal(isMsdkBridgeSnapshot(snapshot()), true);
  assert.equal(
    isMsdkBridgeSnapshot({
      ...snapshot(),
      gateway: { connected: true, serialNumber: "" }
    }),
    false
  );
});

test("pairs and accepts heartbeat for the bound gateway/aircraft", () => {
  let now = 10_000;
  const service = new MsdkBridgeService({
    pairingToken: "pair-secret",
    signingSecret: "sign-secret",
    tokenTtlMs: 60_000,
    now: () => now
  });

  const paired = service.pair("pair-secret", snapshot());
  assert.ok(paired);
  assert.equal(paired.gatewaySn, "RC-PRO-001");
  assert.equal(paired.aircraftSn, "M3T-001");
  assert.equal(paired.expiresAt, 70_000);

  now = 20_000;
  assert.equal(service.heartbeat(paired.agentToken, snapshot()), true);

  const agents = service.listAgents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0]?.lastSeenAt, 20_000);
});

test("rejects wrong bootstrap token and identity switching", () => {
  const service = new MsdkBridgeService({
    pairingToken: "pair-secret",
    signingSecret: "sign-secret",
    now: () => 10_000
  });

  assert.equal(service.pair("wrong", snapshot()), undefined);

  const paired = service.pair("pair-secret", snapshot());
  assert.ok(paired);
  assert.equal(
    service.heartbeat(
      paired.agentToken,
      snapshot("RC-PRO-001", "M3T-OTHER")
    ),
    false
  );
});

test("rejects expired agent tokens", () => {
  let now = 10_000;
  const service = new MsdkBridgeService({
    pairingToken: "pair-secret",
    signingSecret: "sign-secret",
    tokenTtlMs: 100,
    now: () => now
  });

  const paired = service.pair("pair-secret", snapshot());
  assert.ok(paired);

  now = 10_101;
  assert.equal(service.heartbeat(paired.agentToken, snapshot()), false);
});

test("does not pair disconnected or unregistered agents", () => {
  const service = new MsdkBridgeService({
    pairingToken: "pair-secret",
    signingSecret: "sign-secret"
  });

  assert.equal(
    service.pair("pair-secret", {
      ...snapshot(),
      sdk: { registered: false, productConnected: true }
    }),
    undefined
  );
});
