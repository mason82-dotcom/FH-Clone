export interface DjiPayloadProfile {
  payloadIndex: string;
  name: string;
  family: "mavic-3-enterprise" | "matrice-4";
  thermal: boolean;
}

/**
 * Built-in camera identities documented by DJI Cloud API.
 *
 * Keep this registry limited to stable payload_index identities. Lens/video
 * paths remain runtime-discovered and must not be inferred from this table.
 */
export const DJI_PAYLOAD_PROFILES: Readonly<Record<string, DjiPayloadProfile>> = {
  "66-0-0": {
    payloadIndex: "66-0-0",
    name: "DJI Mavic 3E Camera",
    family: "mavic-3-enterprise",
    thermal: false
  },
  "67-0-0": {
    payloadIndex: "67-0-0",
    name: "DJI Mavic 3T Camera",
    family: "mavic-3-enterprise",
    thermal: true
  },
  "129-0-0": {
    payloadIndex: "129-0-0",
    name: "DJI Mavic 3TA Camera",
    family: "mavic-3-enterprise",
    thermal: true
  },
  "88-0-0": {
    payloadIndex: "88-0-0",
    name: "DJI Matrice 4E Camera",
    family: "matrice-4",
    thermal: false
  },
  "89-0-0": {
    payloadIndex: "89-0-0",
    name: "DJI Matrice 4T Camera",
    family: "matrice-4",
    thermal: true
  }
};

export function getDjiPayloadProfile(
  payloadIndex: string
): DjiPayloadProfile | undefined {
  return DJI_PAYLOAD_PROFILES[payloadIndex];
}
