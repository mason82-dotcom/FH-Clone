import assert from "node:assert/strict";
import test from "node:test";

import {
  describeDjiProduct,
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


test("product description requires the full DJI identity", () => {
  assert.equal(
    describeDjiProduct({ domain: 0, type: 77, subType: 0 }),
    "DJI Mavic 3 Enterprise"
  );
  assert.equal(
    describeDjiProduct({ domain: 2, type: 144, subType: 0 }),
    "DJI RC Pro Enterprise"
  );
  assert.equal(
    describeDjiProduct({ domain: 1, type: 77, subType: 0 }),
    "DJI product 1/77/0"
  );
  assert.equal(
    describeDjiProduct({ domain: 0, type: 77, subType: 2 }),
    "DJI product 0/77/2"
  );
  assert.equal(
    describeDjiProduct({ type: 99, subType: 0 }),
    "DJI product ?/99/0"
  );
});

test("Dock 3 and Matrice 4D family use DJI documented product identities", () => {
  assert.equal(
    describeDjiProduct({ domain: 3, type: 3, subType: 0 }),
    "DJI Dock 3"
  );
  assert.equal(
    describeDjiProduct({ domain: 0, type: 100, subType: 0 }),
    "DJI Matrice 4D"
  );
  assert.equal(
    describeDjiProduct({ domain: 0, type: 100, subType: 1 }),
    "DJI Matrice 4TD"
  );
  assert.equal(
    describeDjiProduct({ domain: 1, type: 100, subType: 1 }),
    "DJI product 1/100/1"
  );
});

