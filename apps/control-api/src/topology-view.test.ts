import assert from "node:assert/strict";
import test from "node:test";

import type { DjiGatewayTopology } from "@fh-clone/adapter-dji-cloud";
import type {
  MsdkAgentRecord,
  MsdkBridgeSnapshot
} from "./msdk-bridge.js";
import { buildDjiTopologyView } from "./topology-view.js";

function snapshot(
  productType: string,
  aircraftSn: string,
  cameraType = productType
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
      productType,
      flightControllerSerial: aircraftSn
    },
    sensors: [
      {
        index: "LEFT_OR_MAIN",
        cameraConnected: true,
        cameraType,
        gimbalConnected: true
      }
    ],
    rtk: {},
    control: {
      networkArmed: false,
      networkArmedAt: null,
      virtualStick: {
        enabled: false,
        authorityOwner: "UNKNOWN"
      }
    },
    capabilities: {
      camera: true,
      gimbal: true,
      thermal: false,
      multispectral: productType === "M3M",
      rtk: true,
      wayline: true,
      virtualStick: true
    }
  };
}

function agent(
  productType: string,
  aircraftSn: string,
  cameraType = productType
): MsdkAgentRecord {
  return {
    gatewaySn: "RC-PRO-001",
    aircraftSn,
    pairedAt: 9_000,
    lastSeenAt: 10_000,
    snapshot: snapshot(productType, aircraftSn, cameraType)
  };
}

function rcProTopology(
  subDevices: DjiGatewayTopology["subDevices"] = []
): DjiGatewayTopology {
  return {
    gatewaySn: "RC-PRO-001",
    product: {
      domain: 2,
      type: 144,
      subType: 0
    },
    subDevices,
    updatedAt: 8_000
  };
}

test("adds M3M as an MSDK-derived RC Pro subdevice without inventing a cloud product id", () => {
  const [gateway] = buildDjiTopologyView(
    [rcProTopology()],
    [agent("M3M", "M3M-001")]
  );

  assert.ok(gateway);
  assert.equal(gateway.gatewaySn, "RC-PRO-001");
  assert.equal(gateway.relationSource, "merged");
  assert.equal(gateway.subDevices.length, 1);

  const m3m = gateway.subDevices[0];
  assert.equal(m3m?.sn, "M3M-001");
  assert.equal(m3m?.product.displayName, "DJI Mavic 3M");
  assert.equal(m3m?.product.identitySource, "msdk-v5");
  assert.equal(m3m?.product.cloudEnumerated, false);
  assert.equal(m3m?.product.type, undefined);
  assert.equal(m3m?.product.subType, undefined);
  assert.equal(m3m?.relationSource, "msdk-v5");
});

test("uses sensor inventory to identify M3M when the generic product type is inconclusive", () => {
  const [gateway] = buildDjiTopologyView(
    [],
    [
      agent(
        "MAVIC_3_ENTERPRISE_SERIES",
        "M3M-002",
        "DJI_MAVIC_3M"
      )
    ]
  );

  assert.ok(gateway);
  assert.equal(gateway.product.displayName, "DJI RC Pro Enterprise");
  assert.equal(gateway.product.type, 144);
  assert.equal(gateway.subDevices[0]?.product.displayName, "DJI Mavic 3M");
});

test("keeps known M3T cloud identity and does not duplicate the same aircraft", () => {
  const cloud = rcProTopology([
    {
      sn: "M3T-001",
      product: {
        domain: 0,
        type: 77,
        subType: 1
      }
    }
  ]);

  const [gateway] = buildDjiTopologyView(
    [cloud],
    [agent("M3T", "M3T-001")]
  );

  assert.ok(gateway);
  assert.equal(gateway.subDevices.length, 1);
  assert.equal(gateway.subDevices[0]?.product.type, 77);
  assert.equal(gateway.subDevices[0]?.product.subType, 1);
  assert.equal(
    gateway.subDevices[0]?.product.identitySource,
    "dji-cloud"
  );
});

test("does not attach an M3-series bridge aircraft to a non-RC-Pro cloud gateway", () => {
  const [gateway] = buildDjiTopologyView(
    [
      {
        gatewaySn: "RC-PRO-001",
        product: {
          domain: 2,
          type: 174,
          subType: 0
        },
        subDevices: [],
        updatedAt: 8_000
      }
    ],
    [agent("M3M", "M3M-003")]
  );

  assert.ok(gateway);
  assert.equal(gateway.product.type, 174);
  assert.equal(gateway.subDevices.length, 0);
});
