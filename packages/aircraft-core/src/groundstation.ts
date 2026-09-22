import type { MissionRtkContext } from "./mission.js";

export type GroundStationCapability =
  | "groundstation.vehicle.read"
  | "groundstation.telemetry.read"
  | "groundstation.route.read"
  | "groundstation.route.plan"
  | "groundstation.route.import"
  | "groundstation.route.export"
  | "groundstation.mission.upload"
  | "groundstation.mission.execute"
  | (string & {});

export interface GroundStationVehicle {
  id: string;
  name?: string;
  vendor?: string;
  model?: string;
  serialNumber?: string;
  connected: boolean;
  metadata?: Record<string, unknown>;
}

export interface GroundStationGeoPoint {
  latitudeDeg: number;
  longitudeDeg: number;
  /** WGS84/ellipsoid-like absolute altitude when supplied by the source. */
  altitudeM?: number;
  /** AGL altitude when supplied by the source. Do not treat as absolute. */
  aglAltitudeM?: number;
}

export interface GroundStationRouteSegment {
  id?: string;
  figureType?: string;
  points: GroundStationGeoPoint[];
}

export interface GroundStationRoute {
  id: string;
  name: string;
  segments?: GroundStationRouteSegment[];
  metadata?: Record<string, unknown>;
}

export interface GroundStationTelemetryValue {
  time?: number;
  value: unknown;
  /** Original UCS semantic such as S_LATITUDE or S_ALTITUDE_AMSL. */
  semantic?: string;
  /** Original UCS subsystem such as S_FLIGHT_CONTROLLER. */
  subsystem?: string;
  /** Original vendor field code. */
  code?: string;
}

export type GroundStationTelemetrySnapshot =
  Record<string, Record<string, GroundStationTelemetryValue>>;

export interface GroundStationMission {
  id: string;
  name: string;
  format: string;
  metadata?: Record<string, unknown>;
  /**
   * Non-sensitive RTK context for documentation/audit.
   * NTRIP connection parameters and credentials are intentionally excluded.
   */
  rtk?: MissionRtkContext;
}

export interface GroundStationHealth {
  connected: boolean;
  version?: string;
  details?: Record<string, unknown>;
}

export interface MissionBinary {
  format: string;
  bytes: Uint8Array;
}

export interface GroundStationAdapter {
  readonly id: string;
  readonly capabilities: readonly GroundStationCapability[];

  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<GroundStationHealth>;
  listVehicles(): Promise<GroundStationVehicle[]>;
  listRoutes?(): Promise<GroundStationRoute[]>;
  readTelemetrySnapshot?(): Promise<GroundStationTelemetrySnapshot>;

  importMission?(input: MissionBinary): Promise<GroundStationMission>;
  exportMission?(missionId: string, format: string): Promise<MissionBinary>;
  uploadMission?(vehicleId: string, missionId: string): Promise<void>;
}
