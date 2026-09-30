import {
  describeDjiProduct,
  type DjiGatewayTopology,
  type DjiProductRef
} from "@fh-clone/adapter-dji-cloud";
import type { MsdkAgentRecord, MsdkBridgeSnapshot } from "./msdk-bridge.js";

export type DjiTopologyIdentitySource = "dji-cloud" | "msdk-v5";

export interface DjiTopologyViewProduct {
  domain?: string | number;
  type?: number;
  subType?: number;
  thingVersion?: string;
  displayName: string;
  identitySource: DjiTopologyIdentitySource;
  cloudEnumerated: boolean;
}

export interface DjiTopologyViewSubDevice {
  sn: string;
  index?: string;
  product: DjiTopologyViewProduct;
  relationSource: DjiTopologyIdentitySource;
}

export interface DjiTopologyViewGateway {
  gatewaySn: string;
  product: DjiTopologyViewProduct;
  subDevices: DjiTopologyViewSubDevice[];
  updatedAt: number;
  relationSource: DjiTopologyIdentitySource | "merged";
}

interface MsdkAircraftProfile {
  product: DjiTopologyViewProduct;
  gateway: DjiProductRef;
}

const RC_PRO_ENTERPRISE: DjiProductRef = {
  domain: 2,
  type: 144,
  subType: 0
};

export function buildDjiTopologyView(
  cloudTopologies: readonly DjiGatewayTopology[],
  msdkAgents: readonly MsdkAgentRecord[]
): DjiTopologyViewGateway[] {
  const gateways = new Map<string, DjiTopologyViewGateway>();

  for (const topology of cloudTopologies) {
    gateways.set(topology.gatewaySn, {
      gatewaySn: topology.gatewaySn,
      product: cloudProduct(topology.product),
      subDevices: topology.subDevices.map((device) => ({
        sn: device.sn,
        ...(device.index ? { index: device.index } : {}),
        product: cloudProduct(device.product),
        relationSource: "dji-cloud"
      })),
      updatedAt: topology.updatedAt,
      relationSource: "dji-cloud"
    });
  }

  for (const agent of msdkAgents) {
    const snapshot = agent.snapshot;
    if (
      !snapshot.sdk.registered ||
      !snapshot.sdk.productConnected ||
      !snapshot.gateway.connected ||
      !snapshot.aircraft.flightControllerConnected
    ) {
      continue;
    }

    const profile = msdkAircraftProfile(snapshot);
    if (!profile) continue;

    const existingGateway = gateways.get(agent.gatewaySn);
    if (
      existingGateway &&
      !isRcProEnterprise(existingGateway.product)
    ) {
      continue;
    }

    const gateway =
      existingGateway ??
      {
        gatewaySn: agent.gatewaySn,
        product: msdkKnownProduct(
          profile.gateway,
          "DJI RC Pro Enterprise"
        ),
        subDevices: [],
        updatedAt: agent.lastSeenAt,
        relationSource: "msdk-v5" as const
      };

    if (
      !gateway.subDevices.some(
        (device) => device.sn === agent.aircraftSn
      )
    ) {
      gateway.subDevices.push({
        sn: agent.aircraftSn,
        product: profile.product,
        relationSource: "msdk-v5"
      });
    }

    gateway.updatedAt = Math.max(gateway.updatedAt, agent.lastSeenAt);
    if (existingGateway) {
      gateway.relationSource = "merged";
    }
    gateways.set(agent.gatewaySn, gateway);
  }

  return [...gateways.values()].sort((a, b) =>
    a.gatewaySn.localeCompare(b.gatewaySn)
  );
}

function cloudProduct(product: DjiProductRef): DjiTopologyViewProduct {
  return {
    ...(product.domain !== undefined ? { domain: product.domain } : {}),
    type: product.type,
    subType: product.subType,
    ...(product.thingVersion
      ? { thingVersion: product.thingVersion }
      : {}),
    displayName: describeDjiProduct(product),
    identitySource: "dji-cloud",
    cloudEnumerated: true
  };
}

function msdkKnownProduct(
  product: DjiProductRef,
  displayName: string
): DjiTopologyViewProduct {
  return {
    ...(product.domain !== undefined ? { domain: product.domain } : {}),
    type: product.type,
    subType: product.subType,
    ...(product.thingVersion
      ? { thingVersion: product.thingVersion }
      : {}),
    displayName,
    identitySource: "msdk-v5",
    cloudEnumerated: true
  };
}

function msdkOnlyProduct(displayName: string): DjiTopologyViewProduct {
  return {
    displayName,
    identitySource: "msdk-v5",
    cloudEnumerated: false
  };
}

function msdkAircraftProfile(
  snapshot: MsdkBridgeSnapshot
): MsdkAircraftProfile | undefined {
  const identities = new Set(
    [
      snapshot.aircraft.productType,
      ...snapshot.sensors
        .map((sensor) => sensor.cameraType)
        .filter((value): value is string => Boolean(value))
    ].map(normalizeProductToken)
  );

  if (
    hasAny(identities, [
      "M3M",
      "MAVIC_3M",
      "MAVIC_3_MULTISPECTRAL"
    ])
  ) {
    return {
      product: msdkOnlyProduct("DJI Mavic 3M"),
      gateway: RC_PRO_ENTERPRISE
    };
  }

  if (
    hasAny(identities, [
      "M3TA",
      "MAVIC_3TA",
      "MAVIC_3_THERMAL_ADVANCED"
    ])
  ) {
    return {
      product: msdkKnownProduct(
        { domain: 0, type: 77, subType: 3 },
        "DJI Mavic 3TA"
      ),
      gateway: RC_PRO_ENTERPRISE
    };
  }

  if (
    hasAny(identities, [
      "M3T",
      "MAVIC_3T",
      "MAVIC_3_THERMAL"
    ])
  ) {
    return {
      product: msdkKnownProduct(
        { domain: 0, type: 77, subType: 1 },
        "DJI Mavic 3 Thermal"
      ),
      gateway: RC_PRO_ENTERPRISE
    };
  }

  if (
    hasAny(identities, [
      "M3E",
      "MAVIC_3E",
      "MAVIC_3_ENTERPRISE"
    ])
  ) {
    return {
      product: msdkKnownProduct(
        { domain: 0, type: 77, subType: 0 },
        "DJI Mavic 3 Enterprise"
      ),
      gateway: RC_PRO_ENTERPRISE
    };
  }

  return undefined;
}

function hasAny(
  identities: ReadonlySet<string>,
  aliases: readonly string[]
): boolean {
  return aliases.some((alias) =>
    identities.has(normalizeProductToken(alias))
  );
}

function normalizeProductToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^DJI_/, "")
    .replace(/^_+|_+$/g, "");
}

function isRcProEnterprise(
  product: DjiTopologyViewProduct
): boolean {
  return (
    String(product.domain ?? "") === "2" &&
    product.type === 144 &&
    product.subType === 0
  );
}
