export type DjiRtkFixState =
  | "not_started"
  | "fixing"
  | "fixed"
  | "failed"
  | "unknown";

export interface DjiRtkStatus {
  fixState: DjiRtkFixState;
  fixStateCode?: number;
  qualityCode?: number;
  isFixed?: boolean;
  gpsSatellites?: number;
  rtkSatellites?: number;
  modeCode?: number;
  airborneRtkFixingMode: boolean;
  sampledAt: number;
}

export interface RtkFixTransition {
  deviceId: string;
  type: "acquired" | "lost";
  sampledAt: number;
  previousFixed: boolean;
  currentFixed: boolean;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fixStateFromCode(code: number | undefined): DjiRtkFixState {
  switch (code) {
    case 0:
      return "not_started";
    case 1:
      return "fixing";
    case 2:
      return "fixed";
    case 3:
      return "failed";
    default:
      return "unknown";
  }
}

/**
 * Parse read-only RTK/GNSS state from a DJI Cloud API OSD/state payload.
 *
 * DJI defines position_state.is_fixed as an enum:
 *   0 = not started
 *   1 = fixing
 *   2 = fixed successfully
 *   3 = fixing failed
 *
 * position_state.quality = 10 also denotes an RTK-fixed acquisition mode.
 * mode_code = 18 is an aircraft operating mode ("Airborne RTK fixing mode"),
 * not the fix-success flag itself.
 */
export function parseDjiRtkStatus(
  payload: unknown,
  sampledAt = Date.now()
): DjiRtkStatus | undefined {
  if (!isRecord(payload)) return undefined;
  const source = isRecord(payload.data) ? payload.data : payload;
  const host = isRecord(source.host) ? source.host : source;
  const positionState = isRecord(host.position_state)
    ? host.position_state
    : isRecord(source.position_state)
      ? source.position_state
      : undefined;

  const fixStateCode = numeric(positionState?.is_fixed);
  const qualityCode = numeric(positionState?.quality);
  const gpsSatellites =
    numeric(positionState?.gps_number) ??
    numeric(host.gps_number) ??
    numeric(source.gps_number);
  const rtkSatellites =
    numeric(positionState?.rtk_number) ??
    numeric(host.rtk_number) ??
    numeric(source.rtk_number);
  const modeCode = numeric(host.mode_code) ?? numeric(source.mode_code);

  if (
    fixStateCode === undefined &&
    qualityCode === undefined &&
    gpsSatellites === undefined &&
    rtkSatellites === undefined &&
    modeCode === undefined
  ) {
    return undefined;
  }

  const fixState = fixStateFromCode(fixStateCode);
  const isFixed =
    fixStateCode !== undefined
      ? fixStateCode === 2
      : qualityCode === 10
        ? true
        : undefined;

  return {
    fixState,
    ...(fixStateCode !== undefined ? { fixStateCode } : {}),
    ...(qualityCode !== undefined ? { qualityCode } : {}),
    ...(isFixed !== undefined ? { isFixed } : {}),
    ...(gpsSatellites !== undefined ? { gpsSatellites } : {}),
    ...(rtkSatellites !== undefined ? { rtkSatellites } : {}),
    ...(modeCode !== undefined ? { modeCode } : {}),
    airborneRtkFixingMode: modeCode === 18,
    sampledAt
  };
}

/**
 * Keeps only the previous fixed/not-fixed state per aircraft and reports
 * deterministic fix transitions. Initial observation never emits an alert.
 */
export class RtkFixMonitor {
  private readonly fixedByDevice = new Map<string, boolean>();

  observe(
    deviceId: string,
    status: DjiRtkStatus
  ): RtkFixTransition | undefined {
    if (status.isFixed === undefined) return undefined;

    const previous = this.fixedByDevice.get(deviceId);
    this.fixedByDevice.set(deviceId, status.isFixed);

    if (previous === undefined || previous === status.isFixed) {
      return undefined;
    }

    return {
      deviceId,
      type: status.isFixed ? "acquired" : "lost",
      sampledAt: status.sampledAt,
      previousFixed: previous,
      currentFixed: status.isFixed
    };
  }
}
