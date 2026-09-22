import type { Capability, ParameterSample } from "@fh-clone/aircraft-core";
import { parseDjiRtkStatus } from "./rtk.js";

type JsonRecord = Record<string, unknown>;

interface FieldSpec {
  key: string;
  unit?: string;
  capability: Capability;
}

const LEAF_FIELDS: Record<string, FieldSpec> = {
  latitude: {
    key: "flight.position.latitude_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  longitude: {
    key: "flight.position.longitude_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  // DJI Cloud API: height = ellipsoid height.
  height: {
    key: "flight.altitude.ellipsoid_m",
    unit: "m",
    capability: "telemetry.flight"
  },
  // DJI Cloud API: elevation = height relative to takeoff/start point.
  elevation: {
    key: "flight.altitude.relative_m",
    unit: "m",
    capability: "telemetry.flight"
  },
  horizontal_speed: {
    key: "flight.velocity.horizontal_mps",
    unit: "m/s",
    capability: "telemetry.flight"
  },
  vertical_speed: {
    key: "flight.velocity.vertical_mps",
    unit: "m/s",
    capability: "telemetry.flight"
  },
  attitude_head: {
    key: "flight.attitude.yaw_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  yaw: {
    key: "flight.attitude.yaw_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  pitch: {
    key: "flight.attitude.pitch_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  roll: {
    key: "flight.attitude.roll_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  satellite_number: {
    key: "navigation.gnss.satellites",
    capability: "telemetry.flight"
  },
  mode_code: {
    key: "flight.mode.code",
    capability: "telemetry.flight"
  },
  gps_number: {
    key: "navigation.gnss.gps_satellites",
    capability: "telemetry.rtk"
  },
  rtk_number: {
    key: "navigation.rtk.satellites",
    capability: "telemetry.rtk"
  }
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

function knownField(rawKey: string): FieldSpec | undefined {
  const lower = rawKey.toLowerCase();

  if (lower.endsWith("position_state.is_fixed")) {
    return {
      key: "navigation.rtk.fix_state_code",
      capability: "telemetry.rtk"
    };
  }

  if (lower.endsWith("position_state.quality")) {
    return {
      key: "navigation.rtk.quality_code",
      capability: "telemetry.rtk"
    };
  }

  const leaf = lower.split(".").at(-1) ?? lower;
  return LEAF_FIELDS[leaf];
}

function inferCapability(rawKey: string): Capability | undefined {
  const lower = rawKey.toLowerCase();
  if (lower.includes("battery")) return "telemetry.battery";
  if (
    lower.includes("rtk") ||
    lower.includes("position_state") ||
    lower.endsWith("gps_number")
  ) {
    return "telemetry.rtk";
  }
  if (lower.includes("camera")) return "telemetry.camera";
  if (lower.includes("gimbal")) return "telemetry.gimbal";
  if (
    lower.includes("latitude") ||
    lower.includes("longitude") ||
    lower.includes("height") ||
    lower.includes("elevation") ||
    lower.includes("speed") ||
    lower.includes("attitude") ||
    lower.includes("satellite")
  ) return "telemetry.flight";
  return undefined;
}

function sample(
  deviceId: string,
  key: string,
  rawKey: string,
  value: unknown,
  sampledAt: number,
  unit?: string
): ParameterSample {
  return {
    adapterId: "dji-cloud",
    deviceId,
    key,
    rawKey,
    value,
    ...(unit ? { unit } : {}),
    sampledAt,
    quality: "unknown"
  };
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
    const known = knownField(rawKey);
    const capability = known?.capability ?? inferCapability(rawKey);
    if (capability) capabilities.add(capability);

    return sample(
      deviceId,
      known?.key ?? `raw.dji-cloud.${rawKey}`,
      rawKey,
      value,
      sampledAt,
      known?.unit
    );
  });

  const rtk = parseDjiRtkStatus(payload, sampledAt);
  if (rtk) {
    capabilities.add("telemetry.rtk");

    samples.push(
      sample(
        deviceId,
        "navigation.rtk.fix_status",
        "derived:position_state.is_fixed",
        rtk.fixState,
        sampledAt
      )
    );

    if (rtk.isFixed !== undefined) {
      samples.push(
        sample(
          deviceId,
          "navigation.rtk.fixed",
          "derived:position_state.is_fixed|position_state.quality",
          rtk.isFixed,
          sampledAt
        )
      );
    }

    samples.push(
      sample(
        deviceId,
        "navigation.rtk.airborne_fixing_mode",
        "derived:mode_code",
        rtk.airborneRtkFixingMode,
        sampledAt
      )
    );
  }

  return { samples, capabilities: [...capabilities] };
}
