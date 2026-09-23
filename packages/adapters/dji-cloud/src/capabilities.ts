import type { Capability } from "@fh-clone/aircraft-core";
import type { DjiGatewayTopology, DjiProductRef } from "./topology.js";

export const DJI_CLOUD_CONTROL_ENABLED = true as const;
export const DJI_CLOUD_STICK_CONTROL_ENABLED = true as const;
export const DJI_DRONE_CONTROL_ENABLED = true as const;

/**
 * Known Pilot DRC protocol profiles. Runtime selection remains product- and
 * gateway-gated even though the global stick-control policy is enabled.
 */
export type DjiDrcProfile =
  | "none"
  | "pilot-m3-drone"
  | "pilot-m4-stick";

export interface DjiCloudControlProfile {
  /** DJI Pilot Cloud-control authority path is enabled for this product/gateway pair. */
  cloudControl: boolean;
  /** Any executable cloud flight-control path after product/gateway gates. */
  flightControl: boolean;
  /** DJI DRC method stick_control. */
  stickControl: boolean;
  /** DJI DRC method drone_control. */
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
    const cloudControl = supportedGateway && DJI_CLOUD_CONTROL_ENABLED;
    return {
      cloudControl,
      flightControl: cloudControl && DJI_DRONE_CONTROL_ENABLED,
      stickControl: false,
      droneControl: cloudControl && DJI_DRONE_CONTROL_ENABLED,
      flyTo: false,
      pointingFlight: false,
      orbitFlight: false,
      payloadControl: cloudControl,
      requiresCloudControlAuthority: cloudControl,
      drcProfile:
        cloudControl && DJI_DRONE_CONTROL_ENABLED
          ? "pilot-m3-drone"
          : "none",
      capabilities: [],
      reason: supportedGateway
        ? "FH2 enables the DJI Pilot-to-Cloud RC Pro control profile for Mavic 3 Enterprise: drone_control plus documented camera/gimbal payload control. stick_control and FlyTo remain disabled for this profile. FC3/lease/DJI-authority/DRC-session/dead-man guards still apply to flight control."
        : "Mavic 3 Enterprise cloud control remains disabled until a supported RC Pro Enterprise gateway is identified."
    };
  }

  if (isMatrice4Enterprise(aircraft)) {
    const supportedGateway = isRcPlus2(gateway);
    const cloudControl = supportedGateway && DJI_CLOUD_CONTROL_ENABLED;
    return {
      cloudControl,
      flightControl:
        cloudControl &&
        (DJI_CLOUD_STICK_CONTROL_ENABLED || DJI_DRONE_CONTROL_ENABLED),
      stickControl: cloudControl && DJI_CLOUD_STICK_CONTROL_ENABLED,
      droneControl: cloudControl && DJI_DRONE_CONTROL_ENABLED,
      flyTo: cloudControl,
      pointingFlight: false,
      orbitFlight: false,
      payloadControl: false,
      requiresCloudControlAuthority: cloudControl,
      drcProfile:
        cloudControl && DJI_CLOUD_STICK_CONTROL_ENABLED
          ? "pilot-m4-stick"
          : "none",
      // DJI documents M4 cloud flight control. FH2 enables stick_control only
      // after the M4 + RC Plus 2 product/gateway gate. FlyTo and drone_control
      // remain separate DRC/service paths. Payload control is documented by
      // DJI but not implemented as a generic adapter command in V3.
      capabilities: [],
      reason: supportedGateway
        ? "FH2 enables DJI stick_control and drone_control for Matrice 4 behind RC Plus 2. Both remain behind the existing FC3/lease/DJI-authority/DRC-session/dead-man guards. FlyTo remains a separate service capability."
        : "Matrice 4 runtime control requires a supported RC Plus 2 gateway; unsupported or incomplete topology remains fail-closed."
    };
  }

  return {
    cloudControl: false,
    flightControl: false,
    stickControl: false,
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
