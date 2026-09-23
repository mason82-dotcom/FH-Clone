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
  attitude_pitch: {
    key: "flight.attitude.pitch_deg",
    unit: "deg",
    capability: "telemetry.flight"
  },
  attitude_roll: {
    key: "flight.attitude.roll_deg",
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
    capability: "telemetry.flight"
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
      key: "navigation.gnss.fix_state_code",
      capability: "telemetry.flight"
    };
  }

  if (lower.endsWith("position_state.quality")) {
    return {
      key: "navigation.gnss.quality_code",
      capability: "telemetry.flight"
    };
  }

  const leaf = lower.split(".").at(-1) ?? lower;
  return LEAF_FIELDS[leaf];
}

function inferCapability(rawKey: string): Capability | undefined {
  const lower = rawKey.toLowerCase();
  if (lower.includes("battery")) return "telemetry.battery";
  if (lower.includes("rtk")) return "telemetry.rtk";
  if (
    lower.includes("position_state") ||
    lower.endsWith("gps_number")
  ) {
    return "telemetry.flight";
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

const DJI_PAYLOAD_INDEX = /^\d+-\d+-\d+$/;

interface CameraFieldSpec {
  key: string;
  unit?: string;
}

const CAMERA_FIELDS: Record<string, CameraFieldSpec> = {
  camera_mode: { key: "mode.code" },
  photo_state: { key: "capture.photo_state_code" },
  recording_state: { key: "recording.state_code" },
  remain_photo_num: { key: "storage.remaining_photos" },
  remain_record_duration: {
    key: "storage.remaining_record_seconds",
    unit: "s"
  },
  record_time: {
    key: "recording.elapsed_seconds",
    unit: "s"
  },
  zoom_factor: { key: "zoom.factor" },
  ir_zoom_factor: { key: "thermal.zoom_factor" }
};

const GIMBAL_FIELDS: Record<string, CameraFieldSpec> = {
  gimbal_pitch: { key: "pitch_deg", unit: "deg" },
  gimbal_roll: { key: "roll_deg", unit: "deg" },
  gimbal_yaw: { key: "yaw_deg", unit: "deg" }
};

function normalizeCameraTelemetry(
  deviceId: string,
  source: JsonRecord,
  sampledAt: number
): ParameterSample[] {
  if (!Array.isArray(source.cameras)) return [];

  const samples: ParameterSample[] = [];

  for (const camera of source.cameras) {
    if (!isRecord(camera)) continue;
    const payloadIndex = camera.payload_index;
    if (
      typeof payloadIndex !== "string" ||
      !DJI_PAYLOAD_INDEX.test(payloadIndex)
    ) {
      continue;
    }

    samples.push(
      sample(
        deviceId,
        `camera.${payloadIndex}.payload_index`,
        "cameras[].payload_index",
        payloadIndex,
        sampledAt
      )
    );

    for (const [rawField, spec] of Object.entries(CAMERA_FIELDS)) {
      if (!(rawField in camera)) continue;
      samples.push(
        sample(
          deviceId,
          `camera.${payloadIndex}.${spec.key}`,
          `cameras[].${rawField}`,
          camera[rawField],
          sampledAt,
          spec.unit
        )
      );
    }
  }

  return samples;
}

function normalizeGimbalTelemetry(
  deviceId: string,
  source: JsonRecord,
  sampledAt: number
): ParameterSample[] {
  const samples: ParameterSample[] = [];

  for (const [payloadIndex, value] of Object.entries(source)) {
    if (!DJI_PAYLOAD_INDEX.test(payloadIndex) || !isRecord(value)) {
      continue;
    }

    for (const [rawField, spec] of Object.entries(GIMBAL_FIELDS)) {
      if (!(rawField in value)) continue;
      samples.push(
        sample(
          deviceId,
          `gimbal.${payloadIndex}.${spec.key}`,
          `${payloadIndex}.${rawField}`,
          value[rawField],
          sampledAt,
          spec.unit
        )
      );
    }
  }

  return samples;
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

  const cameraSamples = normalizeCameraTelemetry(
    deviceId,
    source,
    sampledAt
  );
  if (cameraSamples.length > 0) {
    capabilities.add("telemetry.camera");
    samples.push(...cameraSamples);
  }

  const gimbalSamples = normalizeGimbalTelemetry(
    deviceId,
    source,
    sampledAt
  );
  if (gimbalSamples.length > 0) {
    capabilities.add("telemetry.gimbal");
    samples.push(...gimbalSamples);
  }

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
          "derived:position_state.quality|position_state.is_fixed",
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
