import assert from "node:assert/strict";
import test from "node:test";

import { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

import { authorizeDjiGateway } from "./authz.js";

function topology(): DjiTopologyRegistry {
  const registry = new DjiTopologyRegistry();
  registry.apply({
    gatewaySn: "RC-PRO-001",
    product: { type: 144, subType: 0 },
    subDevices: [
      {
        sn: "M3E-001",
        index: "A",
        product: { type: 77, subType: 0 }
      }
    ],
    updatedAt: 1
  });
  return registry;
}

function request(overrides: Partial<{
  username: string;
  clientid: string;
  action: string;
  topic: string;
}> = {}) {
  return {
    username: "dji-gateway-RC-PRO-001",
    clientid: "RC-PRO-001",
    action: "publish",
    topic: "sys/product/RC-PRO-001/status",
    ...overrides
  };
}

test("allows the gateway topology bootstrap on sys/status", () => {
  assert.equal(authorizeDjiGateway(topology(), request()), "allow");
});

test("allows the RC-Pro-specific thing/status topology path", () => {
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/RC-PRO-001/status" })
    ),
    "allow"
  );
});

test("allows aircraft osd only for a registered sub-device", () => {
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-001/osd" })
    ),
    "allow"
  );
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-OTHER/osd" })
    ),
    "deny"
  );
});

test("allows only own gateway downlink subscriptions", () => {
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({
        action: "subscribe",
        topic: "thing/product/RC-PRO-001/services"
      })
    ),
    "allow"
  );
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({
        action: "subscribe",
        topic: "thing/product/RC-PRO-OTHER/services"
      })
    ),
    "deny"
  );
});

test("denies a gateway username that does not match the MQTT clientid", () => {
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({ username: "dji-gateway-RC-PRO-OTHER" })
    ),
    "deny"
  );
});

test("non DJI gateway identities are ignored for the next authorizer", () => {
  assert.equal(
    authorizeDjiGateway(
      topology(),
      request({ username: "backend-service" })
    ),
    "ignore"
  );
});
