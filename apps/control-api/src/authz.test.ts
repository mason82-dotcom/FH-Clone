import assert from "node:assert/strict";
import test from "node:test";

import { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

import {
  authorizeDjiGateway,
  authorizeEmqx,
  evaluateEmqxAuthorization,
  isEmqxAuthorizationRequest
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

function request(overrides: Partial<{
  username: string;
  clientid: string;
  action: string;
  topic: string;
  qos: string | number;
  peerhost: string;
}> = {}) {
  return {
    username: "dji-gateway-RC-PRO-001",
    clientid: "RC-PRO-001",
    action: "publish",
    topic: "sys/product/RC-PRO-001/status",
    qos: "0",
    peerhost: "10.0.0.20",
    ...overrides
  };
}

test("validates the EMQX authorization request schema", () => {
  assert.equal(isEmqxAuthorizationRequest(request()), true);
  assert.equal(
    isEmqxAuthorizationRequest({ ...request(), action: "delete" }),
    false
  );
  assert.equal(
    isEmqxAuthorizationRequest({ ...request(), topic: "" }),
    false
  );
});

test("allows topology bootstrap for the matching gateway", async () => {
  assert.equal(await authorizeDjiGateway(topology(), request()), "allow");
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/RC-PRO-001/status" })
    ),
    "allow"
  );
});

test("allows aircraft osd only for a registered sub-device", async () => {
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-001/osd" })
    ),
    "allow"
  );
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ topic: "thing/product/M3E-OTHER/osd" })
    ),
    "deny"
  );
});

test("denies a gateway username that does not match clientid", async () => {
  assert.equal(
    await authorizeDjiGateway(
      topology(),
      request({ username: "dji-gateway-RC-PRO-OTHER" })
    ),
    "deny"
  );
});

test("M4 DRC is denied unless the dynamic session policy is active", async () => {
  const drcUp = request({
    username: "dji-gateway-RC-PLUS2-001",
    clientid: "RC-PLUS2-001",
    action: "publish",
    topic: "thing/product/RC-PLUS2-001/drc/up"
  });

  const drcDown = request({
    username: "dji-gateway-RC-PLUS2-001",
    clientid: "RC-PLUS2-001",
    action: "subscribe",
    topic: "thing/product/RC-PLUS2-001/drc/down"
  });

  assert.equal(await authorizeEmqx(topology(), drcUp), "deny");
  assert.equal(await authorizeEmqx(topology(), drcDown), "deny");

  const active = {
    isDrcGatewayActive: (gatewaySn: string) => gatewaySn === "RC-PLUS2-001"
  };

  assert.equal(await authorizeEmqx(topology(), drcUp, active), "allow");
  assert.equal(await authorizeEmqx(topology(), drcDown, active), "allow");
});

test("backend DRC is dynamically gated while normal backend traffic falls through", async () => {
  const backendDrc = request({
    username: "backend-service",
    clientid: "fh-clone-backend",
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
      request({
        username: "backend-service",
        clientid: "fh-clone-backend",
        action: "publish",
        topic: "thing/product/RC-PLUS2-001/services"
      })
    ),
    "ignore"
  );
});

test("webui operator is explicitly denied dynamic write access", async () => {
  assert.equal(
    await authorizeEmqx(
      topology(),
      request({
        username: "webui-operator",
        clientid: "browser-1",
        action: "publish",
        topic: "thing/product/RC-PLUS2-001/drc/down"
      }),
      {
        isDrcGatewayActive: () => true
      }
    ),
    "deny"
  );
});


test("returns a stable reason for own gateway and sub-device traffic", async () => {
  assert.deepEqual(
    await evaluateEmqxAuthorization(topology(), request()),
    {
      result: "allow",
      reason: "gateway_own_topic",
      gatewaySn: "RC-PRO-001"
    }
  );

  assert.deepEqual(
    await evaluateEmqxAuthorization(
      topology(),
      request({ topic: "thing/product/M3E-OTHER/osd" })
    ),
    {
      result: "deny",
      reason: "gateway_topology_mismatch",
      gatewaySn: "RC-PRO-001",
      aircraftSn: "M3E-OTHER"
    }
  );
});

test("DRC reasons distinguish active and inactive sessions", async () => {
  const drcRequest = request({
    username: "dji-gateway-RC-PLUS2-001",
    clientid: "RC-PLUS2-001",
    topic: "thing/product/RC-PLUS2-001/drc/up"
  });

  assert.equal(
    (await evaluateEmqxAuthorization(topology(), drcRequest)).reason,
    "drc_session_inactive"
  );
  assert.equal(
    (
      await evaluateEmqxAuthorization(topology(), drcRequest, {
        isDrcGatewayActive: () => true
      })
    ).reason,
    "drc_session_active"
  );
});

test("backend DRC publish has a dedicated allow reason", async () => {
  const backend = request({
    username: "backend-service",
    clientid: "fh-clone-backend",
    topic: "thing/product/RC-PLUS2-001/drc/down"
  });

  assert.deepEqual(
    await evaluateEmqxAuthorization(topology(), backend, {
      isDrcGatewayActive: () => true
    }),
    {
      result: "allow",
      reason: "drc_backend_publish",
      gatewaySn: "RC-PLUS2-001"
    }
  );
});

test("webui reasons distinguish read-only from out-of-scope topics", async () => {
  const read = await evaluateEmqxAuthorization(
    topology(),
    request({
      username: "webui-operator",
      clientid: "browser-1",
      action: "subscribe",
      topic: "thing/product/M3E-001/osd"
    })
  );
  assert.equal(read.result, "ignore");
  assert.equal(read.reason, "webui_read_only");

  const write = await evaluateEmqxAuthorization(
    topology(),
    request({
      username: "webui-operator",
      clientid: "browser-1",
      action: "publish",
      topic: "thing/product/RC-PLUS2-001/drc/down"
    })
  );
  assert.equal(write.result, "deny");
  assert.equal(write.reason, "webui_read_only");

  const outside = await evaluateEmqxAuthorization(
    topology(),
    request({
      username: "webui-operator",
      clientid: "browser-1",
      action: "subscribe",
      topic: "$SYS/brokers"
    })
  );
  assert.equal(outside.result, "deny");
  assert.equal(outside.reason, "webui_topic_out_of_scope");
});
