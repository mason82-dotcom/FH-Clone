import type { Capability } from "@fh-clone/aircraft-core";
import type { DjiGatewayTopology, DjiProductRef } from "./topology.js";

export const DJI_CLOUD_STICK_CONTROL_ENABLED = false as const;
export const DJI_DRONE_CONTROL_ENABLED = true as const;

/**
 * Known Pilot DRC protocol profiles. Runtime selection is currently forced to
 * "none" because cloud manual flight control is globally disabled.
 */
export type DjiDrcProfile =
  | "none"
  | "pilot-m4-stick";

export interface DjiCloudControlProfile {
  /** Manual cloud stick-control UI/runtime capability. Globally disabled. */
  flightControl: boolean;
  /** DJI DRC method drone_control. Kept separate from stick_control. */
  droneControl: boolean;
  flyTo: boolean;
  pointingFlight: boolean;
  orbitFlight: boolean;
  payloadControl: boolean;
  requiresCloudControlAuthority: boolean;
  drcProfile: DjiDrcProfile;
  /**
   * Capabilities that are safe to route through AircraftAdapter.execute().
   * DJI product support handled by specialized runtime coordinators must not
   * be advertised here until execute() can actually fulfill the command.
   */
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
      droneControl: false,
      flyTo: false,
      pointingFlight: false,
      orbitFlight: false,
      payloadControl: false,
      requiresCloudControlAuthority: false,
      drcProfile: "none",
      // DJI documents payload control, but FH2 V3 has no generic
      // AircraftAdapter.execute() payload implementation yet.
      capabilities: [],
      reason: supportedGateway
        ? "DJI documents Mavic 3 Enterprise Series payload control behind RC Pro Enterprise, but FH2 V3 does not yet implement a routable camera/gimbal/payload command path; runtime write support therefore remains disabled."
        : "Mavic 3 Enterprise Pilot-Cloud runtime support remains disabled until a supported RC Pro Enterprise gateway and an implemented payload command path are available."
    };
  }

  if (isMatrice4Enterprise(aircraft)) {
    const supportedGateway = isRcPlus2(gateway);
    return {
      flightControl: false,
      droneControl: supportedGateway && DJI_DRONE_CONTROL_ENABLED,
      flyTo: supportedGateway,
      pointingFlight: false,
      orbitFlight: false,
      payloadControl: false,
      requiresCloudControlAuthority: supportedGateway,
      drcProfile: "none",
      // DJI documents M4 cloud flight control, but FH2 keeps manual
      // stick/velocity control globally disabled. FlyTo remains a separate
      // service capability. Payload control is documented by DJI but not
      // implemented as a generic adapter command in V3.
      capabilities: [],
      reason: supportedGateway
        ? "FH2 globally disables stick_control, but keeps DJI drone_control available as a separate DRC method behind RC Plus 2 and the existing FC3/lease/authority/session guards. FlyTo remains a separate service capability."
        : "Matrice 4 runtime control requires a supported RC Plus 2 gateway; stick_control remains globally disabled."
    };
  }

  return {
    flightControl: false,
    droneControl: false,
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
