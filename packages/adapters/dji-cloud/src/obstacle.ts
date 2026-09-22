import type { Capability, ParameterSample } from "@fh-clone/aircraft-core";

type JsonRecord = Record<string, unknown>;

export interface NormalizedObstaclePayload {
  samples: ParameterSample[];
  capabilities: Capability[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function bool01(value: unknown): boolean | undefined {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function distanceMmToM(value: unknown): number | undefined {
  const mm = finiteNumber(value);
  return mm !== undefined && mm >= 0 ? mm / 1000 : undefined;
}

function distanceArrayMmToM(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const converted = value.map(distanceMmToM);
  return converted.every((item): item is number => item !== undefined)
    ? converted
    : undefined;
}

/**
 * Normalizes the low-frequency obstacle-sensing enable state from normal
 * aircraft OSD/state payloads. This is status only, not an obstacle distance.
 */
export function normalizeDjiObstacleAvoidanceState(
  deviceId: string,
  payload: unknown,
  sampledAt: number
): NormalizedObstaclePayload {
  if (!isRecord(payload)) return { samples: [], capabilities: [] };
  const source = isRecord(payload.data) ? payload.data : payload;
  const obstacle = isRecord(source.obstacle_avoidance)
    ? source.obstacle_avoidance
    : undefined;
  if (!obstacle) return { samples: [], capabilities: [] };

  const samples: ParameterSample[] = [];
  const mappings = [
    ["horizon", "safety.obstacle.horizontal.enabled"],
    ["upside", "safety.obstacle.up.enabled"],
    ["downside", "safety.obstacle.down.enabled"]
  ] as const;

  for (const [rawKey, key] of mappings) {
    const enabled = bool01(obstacle[rawKey]);
    if (enabled === undefined) continue;
    samples.push(
      sample(
        deviceId,
        key,
        `obstacle_avoidance.${rawKey}`,
        enabled,
        sampledAt
      )
    );
  }

  return {
    samples,
    capabilities: samples.length > 0 ? ["telemetry.obstacle"] : []
  };
}

/**
 * Normalizes DJI DRC hsi_info_push obstacle telemetry.
 *
 * DJI reports distances in millimeters. FH2 publishes canonical distances in
 * meters while retaining the DJI raw key in ParameterSample.rawKey.
 */
export function normalizeDjiHsiObstacleInfo(
  deviceId: string,
  message: unknown,
  sampledAt: number
): NormalizedObstaclePayload {
  if (!isRecord(message) || message.method !== "hsi_info_push" || !isRecord(message.data)) {
    return { samples: [], capabilities: [] };
  }

  const data = message.data;
  const samples: ParameterSample[] = [];

  const boolMappings = [
    ["front_enable", "safety.obstacle.front.enabled"],
    ["front_work", "safety.obstacle.front.working"],
    ["back_enable", "safety.obstacle.back.enabled"],
    ["back_work", "safety.obstacle.back.working"],
    ["left_enable", "safety.obstacle.left.enabled"],
    ["left_work", "safety.obstacle.left.working"],
    ["right_enable", "safety.obstacle.right.enabled"],
    ["right_work", "safety.obstacle.right.working"],
    ["up_enable", "safety.obstacle.up.enabled"],
    ["up_work", "safety.obstacle.up.working"],
    ["down_enable", "safety.obstacle.down.enabled"],
    ["down_work", "safety.obstacle.down.working"],
    ["horizontal_enable", "safety.obstacle.horizontal.enabled"],
    ["horizontal_work", "safety.obstacle.horizontal.working"],
    ["vertical_enable", "safety.obstacle.vertical.enabled"],
    ["vertical_work", "safety.obstacle.vertical.working"]
  ] as const;

  for (const [rawKey, key] of boolMappings) {
    const value = bool01(data[rawKey]);
    if (value === undefined) continue;
    samples.push(sample(deviceId, key, `data.${rawKey}`, value, sampledAt));
  }

  for (const [rawKey, key] of [
    ["up_distance", "safety.obstacle.up.distance_m"],
    ["down_distance", "safety.obstacle.down.distance_m"]
  ] as const) {
    const value = distanceMmToM(data[rawKey]);
    if (value === undefined) continue;
    samples.push(sample(deviceId, key, `data.${rawKey}`, value, sampledAt, "m"));
  }

  // Current DJI pages call the field around_distances, while some examples
  // still show around_distance. Accept both but never synthesize values.
  const aroundKey =
    Array.isArray(data.around_distances)
      ? "around_distances"
      : Array.isArray(data.around_distance)
        ? "around_distance"
        : undefined;
  if (aroundKey) {
    const distances = distanceArrayMmToM(data[aroundKey]);
    if (distances) {
      samples.push(
        sample(
          deviceId,
          "safety.obstacle.around.distance_m",
          `data.${aroundKey}`,
          distances,
          sampledAt,
          "m"
        )
      );
    }
  }

  return {
    samples,
    capabilities: samples.length > 0 ? ["telemetry.obstacle"] : []
  };
}
