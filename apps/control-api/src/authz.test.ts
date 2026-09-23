import assert from "node:assert/strict";
import test from "node:test";

import { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

import {
  authorizeDjiGateway,
  authorizeEmqx,
  evaluateEmqxAuthorization,
  isEmqxAuthorizationRequest,
  type EmqxAuthorizationPolicy
} from "./authz.js";

function topology(): DjiTopologyRegistry {
  const registry = new DjiTopologyRegistry();

  registry.apply({
    gatewaySn: "RC-PRO-001",
    product: { domain: 2, type: 144, subType: 0 },
    subDevices: [
      {
        sn: "M3E-001",
        index: "A",
        product: { domain: 0, type: 77, subType: 0 }
      }
    ],
    updatedAt: 1
  });

  registry.apply({
    gatewaySn: "RC-PLUS2-001",
    product: { domain: 2, type: 174, subType: 0 },
    subDevices: [
      {
        sn: "M4T-001",
        index: "A",
        product: { domain: 0, type: 99, subType: 1 }
      }
    ],
    updatedAt: 1
  });

  return registry;
}

function request(
  overrides: Partial<{
    username: string;
    clientid: string;
    role: string;
    gateway_sn: string;
    action: string;
    topic: string;
    qos: string | number;
    peerhost: string;
  }> = {}
) {
  return {
    username: "dji-gateway-rc1",
    clientid: "arbitrary-session-id",
    role: "dji_gateway",
    gateway_sn: "RC-PRO-001",
    action: "publish",
    topic: "sys/product/RC-PRO-001/status",
    qos: "0",
    peerhost: "10.0.0.20",
    ...overrides
  };
}

function gatewayPolicy(
  drcActive = false,
  principalActive = true
): EmqxAuthorizationPolicy {
  return {
    isGatewayPrincipalActive: (_username, _gatewaySn) => principalActive,
    isDrcGatewayActive: (_gatewaySn) => drcActive
  };
}

test("validates the EMQX authorization request schema", () => {
  assert.equal(isEmqxAuthorizationRequest(request()), true);
  assert.equal(
    isEmqxAuthorizationRequest({ ...request(), action: "delete" }),
    false
  );
  assert.equal(
    isEmqxAuthorizationRequest({ ...request(), gateway_sn: 123 }),
    false
  );
});

test("allows topology bootstrap only on canonical sys status topic", async () => {
  assert.equal(
    await authorizeDjiGateway(topology(), request(), gatewayPolicy()),
    "allow"
  );

  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/RC-PRO-001/status" }),
      gatewayPolicy()
    ),
    "deny"
  );
});

test("MQTT clientid does not define gateway identity", async () => {
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ clientid: "anything-the-client-needs" }),
      gatewayPolicy()
    ),
    "allow"
  );

  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ gateway_sn: "RC-PRO-OTHER" }),
      gatewayPolicy()
    ),
    "deny"
  );
});

test("gateway-looking username without trusted AuthN attributes is denied", async () => {
  const untrusted = request({
    role: "",
    gateway_sn: ""
  });

  assert.equal(
    await authorizeEmqx(topology(), untrusted, gatewayPolicy()),
    "deny"
  );
});

test("disabled credential binding revokes gateway authorization", async () => {
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request(),
      gatewayPolicy(false, false)
    ),
    "deny"
  );
});

test("allows aircraft osd only for a registered runtime sub-device", async () => {
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-001/osd" }),
      gatewayPolicy()
    ),
    "allow"
  );

  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-OTHER/osd" }),
      gatewayPolicy()
    ),
    "deny"
  );
});

test("M4 DRC requires both principal validity and active runtime session", async () => {
  const drcUp = request({
    username: "dji-gateway-rcplus2",
    gateway_sn: "RC-PLUS2-001",
    action: "publish",
    topic: "thing/product/RC-PLUS2-001/drc/up"
  });

  const drcDown = request({
    username: "dji-gateway-rcplus2",
    gateway_sn: "RC-PLUS2-001",
    action: "subscribe",
    topic: "thing/product/RC-PLUS2-001/drc/down"
  });

  assert.equal(
    await authorizeEmqx(topology(), drcUp, gatewayPolicy(false)),
    "deny"
  );
  assert.equal(
    await authorizeEmqx(topology(), drcDown, gatewayPolicy(false)),
    "deny"
  );

  assert.equal(
    await authorizeEmqx(topology(), drcUp, gatewayPolicy(true)),
    "allow"
  );
  assert.equal(
    await authorizeEmqx(topology(), drcDown, gatewayPolicy(true)),
    "allow"
  );
});

test("backend DRC requires trusted backend role and active DRC session", async () => {
  const backendDrc = request({
    username: "backend-service",
    clientid: "fh-clone-backend",
    role: "backend_service",
    gateway_sn: "",
    action: "publish",
    topic: "thing/product/RC-PLUS2-001/drc/down"
  });

  assert.equal(await authorizeEmqx(topology(), backendDrc), "deny");
  assert.equal(
    await authorizeEmqx(topology(), backendDrc, {
      isDrcGatewayActive: (gatewaySn) => gatewaySn === "RC-PLUS2-001"
    }),
    "allow"
  );

  assert.equal(
    await authorizeEmqx(
      topology(),
      { ...backendDrc, role: "" },
      { isDrcGatewayActive: () => true }
    ),
    "deny"
  );

  assert.equal(
    await authorizeEmqx(
      topology(),
      {
        ...backendDrc,
        topic: "thing/product/RC-PLUS2-001/services"
      },
      { isDrcGatewayActive: () => true }
    ),
    "ignore"
  );
});

test("stable reasons use trusted gateway context", async () => {
  assert.deepEqual(
    await evaluateEmqxAuthorization(
      topology(),
      request(),
      gatewayPolicy()
    ),
    {
      result: "allow",
      reason: "gateway_own_topic",
      gatewaySn: "RC-PRO-001"
    }
  );

  assert.deepEqual(
    await evaluateEmqxAuthorization(
      topology(),
      request({ topic: "thing/product/M3E-OTHER/osd" }),
      gatewayPolicy()
    ),
    {
      result: "deny",
      reason: "gateway_topology_mismatch",
      gatewaySn: "RC-PRO-001",
      aircraftSn: "M3E-OTHER"
    }
  );
});

test("webui remains dynamically read-only", async () => {
  const write = await evaluateEmqxAuthorization(
    topology(),
    request({
      username: "webui-operator",
      clientid: "browser-1",
      role: "",
      gateway_sn: "",
      action: "publish",
      topic: "thing/product/RC-PLUS2-001/drc/down"
    })
  );
  assert.equal(write.result, "deny");
  assert.equal(write.reason, "webui_read_only");

  const read = await evaluateEmqxAuthorization(
    topology(),
    request({
      username: "webui-operator",
      clientid: "browser-1",
      role: "",
      gateway_sn: "",
      action: "subscribe",
      topic: "thing/product/M3E-001/osd"
    })
  );
  assert.equal(read.result, "ignore");
  assert.equal(read.reason, "webui_read_only");
});
