import type { Capability } from "@fh-clone/aircraft-core";
import type { DjiGatewayTopology, DjiProductRef } from "./topology.js";

export interface DjiCloudControlProfile {
  flightControl: boolean;
  flyTo: boolean;
  payloadControl: boolean;
  capabilities: Capability[];
  reason: string;
}

function isMavic3Enterprise(product: DjiProductRef): boolean {
  return product.type === 77;
}

function isMatrice4Enterprise(product: DjiProductRef): boolean {
  return product.type === 99;
}

export function getDjiCloudControlProfile(
  aircraft: DjiProductRef,
  gateway?: DjiProductRef
): DjiCloudControlProfile {
  if (isMavic3Enterprise(aircraft)) {
    return {
      flightControl: false,
      flyTo: false,
      payloadControl: true,
      capabilities: [
        "control.camera",
        "control.gimbal",
        "payload.control"
      ],
      reason:
        "DJI Pilot Cloud currently documents Mavic 3 Enterprise Series as payload-control only; RC joystick flight control remains active."
    };
  }

  if (isMatrice4Enterprise(aircraft)) {
    return {
      flightControl: true,
      flyTo: true,
      payloadControl: true,
      capabilities: [
        "control.flight",
        "control.rth",
        "control.camera",
        "control.gimbal",
        "payload.control"
      ],
      reason:
        "DJI Pilot Cloud documents Matrice 4 Series as supporting flight and payload cloud control."
    };
  }

  return {
    flightControl: false,
    flyTo: false,
    payloadControl: false,
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
