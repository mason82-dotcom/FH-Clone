import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDjiTopologyUpdate,
  toPublicDjiTopologyPayload
} from "./topology.js";

test("topology public payload strips DJI secrets", () => {
  const parsed = parseDjiTopologyUpdate(
    "RC-PRO-001",
    {
      method: "update_topo",
      data: {
        type: 144,
        sub_type: 0,
        device_secret: "gateway-secret",
        nonce: "gateway-nonce",
        sub_devices: [
          {
            sn: "M3E-001",
            type: 77,
            sub_type: 0,
            index: "A",
            device_secret: "aircraft-secret",
            nonce: "aircraft-nonce"
          }
        ]
      }
    },
    1234
  );

  assert.ok(parsed);
  const publicPayload = toPublicDjiTopologyPayload(parsed);
  const encoded = JSON.stringify(publicPayload);

  assert.equal(encoded.includes("gateway-secret"), false);
  assert.equal(encoded.includes("gateway-nonce"), false);
  assert.equal(encoded.includes("aircraft-secret"), false);
  assert.equal(encoded.includes("aircraft-nonce"), false);
  assert.equal(encoded.includes("M3E-001"), true);
});

test("topology parser keeps gateway and sub-device identity", () => {
  const parsed = parseDjiTopologyUpdate(
    "RC-PLUS2-001",
    {
      method: "update_topo",
      data: {
        type: 174,
        sub_type: 0,
        sub_devices: [
          {
            sn: "M4T-001",
            type: 99,
            sub_type: 1,
            index: "A"
          }
        ]
      }
    },
    5678
  );

  assert.ok(parsed);
  assert.equal(parsed.gatewaySn, "RC-PLUS2-001");
  assert.equal(parsed.subDevices[0]?.sn, "M4T-001");
  assert.equal(parsed.updatedAt, 5678);
});
