export type RtkFixState =
  | "not_started"
  | "fixing"
  | "fixed"
  | "failed"
  | "unknown";

export interface RtkDeviceSnapshot {
  deviceId: string;
  gatewaySn?: string;
  missionId?: string;
  fixState: RtkFixState;
  fixStateCode?: number;
  qualityCode?: number;
  isFixed?: boolean;
  gpsSatellites?: number;
  rtkSatellites?: number;
  modeCode?: number;
  airborneRtkFixingMode: boolean;
  sampledAt: number;
  stale: boolean;
  ageMs: number;
}

export interface RtkHistorySample {
  sampledAt: number;
  gpsSatellites?: number;
  rtkSatellites?: number;
  isFixed?: boolean;
  fixState: RtkFixState;
}

export interface RtkFixTransition {
  deviceId: string;
  type: "acquired" | "lost";
  sampledAt: number;
  previousFixed: boolean;
  currentFixed: boolean;
}

export interface RtkStatusEvent {
  type: "status";
  deviceId: string;
  gatewaySn?: string;
  missionId?: string;
  status: Omit<
    RtkDeviceSnapshot,
    "deviceId" | "gatewaySn" | "missionId" | "stale" | "ageMs"
  >;
}

export interface RtkTransitionEvent {
  type: "fix-transition";
  deviceId: string;
  gatewaySn?: string;
  missionId?: string;
  transition: RtkFixTransition;
}
