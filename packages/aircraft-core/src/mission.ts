export type MissionReferenceKind =
  | "wayline"
  | "fh2_flight_task"
  | "dji_mission"
  | "ugcs_mission";

export type MissionReferenceSource =
  | "fh2_openapi_v2"
  | "dji_pilot_wayline"
  | "dji_wpml"
  | "ugcs"
  | "manual";

export type MissionReferenceConfidence =
  | "authoritative"
  | "derived"
  | "heuristic";

export interface MissionExternalReference {
  kind: MissionReferenceKind;
  id: string;
  source: MissionReferenceSource;
  confidence: MissionReferenceConfidence;
}

export function createMissionExternalReference(
  input: MissionExternalReference
): MissionExternalReference {
  const id = input.id.trim();
  if (!id) throw new Error("Mission reference id is required");

  return {
    ...input,
    id
  };
}

export interface RtkCorrectionSourceReference {
  /**
   * Human-readable label only, e.g. "SAPOS BW" or "Company CORS".
   * Never store host, port, mountpoint, username, password or tokens here.
   */
  label: string;
  provider?: string;
  note?: string;
  configuredVia: "dji-pilot-2";
}

export interface MissionRtkSnapshot {
  deviceId: string;
  sampledAt: number;
  fixStatus: "not_started" | "fixing" | "fixed" | "failed" | "unknown";
  fixed?: boolean;
  qualityCode?: number;
  gpsSatellites?: number;
  rtkSatellites?: number;
}

export interface MissionRtkContext {
  source?: RtkCorrectionSourceReference;
  takeoff?: MissionRtkSnapshot;
  landing?: MissionRtkSnapshot;
  minimumRtkSatellites?: number;
  fixLossCount?: number;
}

/**
 * Strict safe-field constructor. Secrets and connection parameters are
 * intentionally not representable by this type.
 */
export function createRtkCorrectionSourceReference(input: {
  label: string;
  provider?: string;
  note?: string;
}): RtkCorrectionSourceReference {
  const label = input.label.trim();
  if (!label) {
    throw new Error("RTK correction source label is required");
  }

  return {
    label,
    configuredVia: "dji-pilot-2",
    ...(input.provider?.trim() ? { provider: input.provider.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {})
  };
}
