import type { Capability, ParameterSample } from "@fh-clone/aircraft-core";

type JsonRecord = Record<string, unknown>;

const KNOWN_FIELDS: Record<string, { key: string; unit?: string; capability: Capability }> = {
  latitude: { key: "flight.position.latitude_deg", unit: "deg", capability: "telemetry.flight" },
  longitude: { key: "flight.position.longitude_deg", unit: "deg", capability: "telemetry.flight" },
  height: { key: "flight.altitude.relative_m", unit: "m", capability: "telemetry.flight" },
  elevation: { key: "flight.altitude.elevation_m", unit: "m", capability: "telemetry.flight" },
  horizontal_speed: { key: "flight.velocity.horizontal_mps", unit: "m/s", capability: "telemetry.flight" },
  vertical_speed: { key: "flight.velocity.vertical_mps", unit: "m/s", capability: "telemetry.flight" },
  attitude_head: { key: "flight.attitude.yaw_deg", unit: "deg", capability: "telemetry.flight" },
  yaw: { key: "flight.attitude.yaw_deg", unit: "deg", capability: "telemetry.flight" },
  pitch: { key: "flight.attitude.pitch_deg", unit: "deg", capability: "telemetry.flight" },
  roll: { key: "flight.attitude.roll_deg", unit: "deg", capability: "telemetry.flight" },
  satellite_number: { key: "navigation.gnss.satellites", capability: "telemetry.flight" }
};

export interface NormalizedPayload {
  samples: ParameterSample[];
  capabilities: Capability[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flatten(prefix: string, value: unknown, output: Array<[string, unknown]>): void {
  if (!isRecord(value)) {
    output.push([prefix, value]);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(child)) flatten(path, child, output);
    else output.push([path, child]);
  }
}

function inferCapability(rawKey: string): Capability | undefined {
  const lower = rawKey.toLowerCase();
  if (lower.includes("battery")) return "telemetry.battery";
  if (lower.includes("rtk")) return "telemetry.rtk";
  if (lower.includes("camera")) return "telemetry.camera";
  if (lower.includes("gimbal")) return "telemetry.gimbal";
  if (
    lower.includes("latitude") ||
    lower.includes("longitude") ||
    lower.includes("height") ||
    lower.includes("speed") ||
    lower.includes("attitude") ||
    lower.includes("satellite")
  ) return "telemetry.flight";
  return undefined;
}

export function normalizeDjiPayload(
  deviceId: string,
  payload: unknown,
  sampledAt: number
): NormalizedPayload {
  if (!isRecord(payload)) return { samples: [], capabilities: [] };

  const source = isRecord(payload.data) ? payload.data : payload;
  const flattened: Array<[string, unknown]> = [];
  flatten("", source, flattened);

  const capabilities = new Set<Capability>();
  const samples = flattened.map(([rawKey, value]): ParameterSample => {
    const leaf = rawKey.split(".").at(-1)?.toLowerCase() ?? rawKey.toLowerCase();
    const known = KNOWN_FIELDS[leaf];
    const capability = known?.capability ?? inferCapability(rawKey);
    if (capability) capabilities.add(capability);

    return {
      adapterId: "dji-cloud",
      deviceId,
      key: known?.key ?? `raw.dji-cloud.${rawKey}`,
      rawKey,
      value,
      ...(known?.unit ? { unit: known.unit } : {}),
      sampledAt,
      quality: "unknown"
    };
  });

  return { samples, capabilities: [...capabilities] };
}
