import type { Capability } from "@fh-clone/aircraft-core";
import type { DjiGatewayTopology, DjiProductRef } from "./topology.js";

export type DjiDrcProfile =
  | "none"
  | "pilot-m3-payload"
  | "pilot-m4-stick"
  | "dock-velocity";

export interface DjiCloudControlProfile {
  flightControl: boolean;
  flyTo: boolean;
  pointingFlight: boolean;
  orbitFlight: boolean;
  payloadControl: boolean;
  requiresCloudControlAuthority: boolean;
  drcProfile: DjiDrcProfile;
  capabilities: Capability[];
  reason: string;
}

function hasDomain(product: DjiProductRef | undefined, domain: number): boolean {
  return product?.domain === domain || product?.domain === String(domain);
}

function isMavic3Enterprise(product: DjiProductRef): boolean {
  return (
    hasDomain(product, 0) &&
    product.type === 77 &&
    [0, 1, 3].includes(product.subType)
  );
}

function isMatrice4Enterprise(product: DjiProductRef): boolean {
  return (
    hasDomain(product, 0) &&
    product.type === 99 &&
    [0, 1].includes(product.subType)
  );
}

function isRcProEnterprise(product?: DjiProductRef): boolean {
  return (
    hasDomain(product, 2) &&
    product?.type === 144 &&
    product.subType === 0
  );
}

function isRcPlus2(product?: DjiProductRef): boolean {
  return (
    hasDomain(product, 2) &&
    product?.type === 174 &&
    product.subType === 0
  );
}

export function getDjiCloudControlProfile(
  aircraft: DjiProductRef,
  gateway?: DjiProductRef
): DjiCloudControlProfile {
  if (isMavic3Enterprise(aircraft)) {
    const supportedGateway = isRcProEnterprise(gateway);
    return {
      flightControl: false,
      flyTo: false,
      pointingFlight: false,
      orbitFlight: false,
      payloadControl: supportedGateway,
      requiresCloudControlAuthority: supportedGateway,
      drcProfile: supportedGateway ? "pilot-m3-payload" : "none",
      capabilities: supportedGateway
        ? ["control.camera", "control.gimbal", "payload.control"]
        : [],
      reason: supportedGateway
        ? "DJI Pilot Cloud documents Mavic 3 Enterprise Series behind RC Pro Enterprise as payload-control only; cloud control still requires RC authorization, while the physical RC joystick remains available for flight."
        : "Mavic 3 Enterprise Pilot-Cloud capabilities are only enabled after a supported RC Pro Enterprise gateway is identified."
    };
  }

  if (isMatrice4Enterprise(aircraft)) {
    const supportedGateway = isRcPlus2(gateway);
    return {
      flightControl: supportedGateway,
      flyTo: supportedGateway,
      pointingFlight: supportedGateway,
      orbitFlight: supportedGateway,
      payloadControl: supportedGateway,
      requiresCloudControlAuthority: supportedGateway,
      drcProfile: supportedGateway ? "pilot-m4-stick" : "none",
      capabilities: supportedGateway
        ? [
            "control.flight",
            "control.rth",
            "control.pointing",
            "control.orbit",
            "control.camera",
            "control.gimbal",
            "payload.control"
          ]
        : [],
      reason: supportedGateway
        ? "DJI Pilot Cloud documents Matrice 4 Series behind RC Plus 2 as supporting cloud flight and payload control, including pointing/orbit modes; flight control still requires explicit authority and FH-Clone FC3."
        : "Matrice 4 Pilot-Cloud flight capabilities are only enabled after a supported RC Plus 2 gateway is identified."
    };
  }

  return {
    flightControl: false,
    flyTo: false,
    pointingFlight: false,
    orbitFlight: false,
    payloadControl: false,
    requiresCloudControlAuthority: false,
    drcProfile: "none",
    capabilities: [],
    reason: gateway
      ? `No explicit Pilot Cloud control profile is registered for aircraft type ${aircraft.type}/${aircraft.subType} behind gateway type ${gateway.type}/${gateway.subType}.`
      : `No explicit Pilot Cloud control profile is registered for aircraft type ${aircraft.type}/${aircraft.subType}.`
  };
}

export function getTopologyAircraftProfile(
  topology: DjiGatewayTopology,
  aircraftSn: string
): DjiCloudControlProfile | undefined {
  const aircraft = topology.subDevices.find((device) => device.sn === aircraftSn);
  if (!aircraft) return undefined;
  return getDjiCloudControlProfile(aircraft.product, topology.product);
}
