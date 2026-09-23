import { Pool } from "pg";
import type {
  ParameterSample,
  RawMessage
} from "@fh-clone/aircraft-core";
import { RetryQueue, type RetryQueueStatus } from "./retry-queue.js";

const FORBIDDEN_KEY =
  /^(?:authorization|bearer(?:token)?|password|secret|token|api[_-]?key|client[_-]?secret|device[_-]?secret|nonce)$/i;
const RAW_BEARER =
  /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i;

export interface TelemetryStoreOptions {
  connectionString?: string;
  queueCapacity?: number;
  retryIntervalMs?: number;
}

interface TelemetryPendingWrite {
  kind: string;
  write(): Promise<void>;
}

export interface TelemetryProjection {
  column:
    | "latitude"
    | "longitude"
    | "height_ellipsoid"
    | "elevation_relative"
    | "horizontal_speed"
    | "vertical_speed"
    | "attitude_head"
    | "attitude_pitch"
    | "attitude_roll"
    | "is_fixed"
    | "quality"
    | "gps_number"
    | "rtk_number"
    | "mode_code";
  value: number;
}

/**
 * Append-only persistence for adapter raw messages and normalized parameter
 * samples. The existing mission-oriented telemetry hypertable receives only a
 * small typed projection; the complete normalized history remains in
 * normalized_parameters with adapter provenance.
 */
export class TelemetryStore {
  private readonly pool: Pool | undefined;
  private readonly queue: RetryQueue<TelemetryPendingWrite> | undefined;

  constructor(options: TelemetryStoreOptions = {}) {
    this.pool = options.connectionString
      ? new Pool({
          connectionString: options.connectionString,
          max: 5,
          idleTimeoutMillis: 30_000
        })
      : undefined;

    this.queue = this.pool
      ? new RetryQueue<TelemetryPendingWrite>({
          capacity: options.queueCapacity ?? 10_000,
          retryIntervalMs: options.retryIntervalMs ?? 1_000,
          dropPolicy: "drop-oldest",
          process: (item) => item.write(),
          onError: (error) => {
            console.error(
              "[Telemetry] Persistenz vorübergehend nicht verfügbar:",
              error.message
            );
          },
          onDrop: (item) => {
            console.error(
              `[Telemetry] Queue-Limit erreicht; ältester Write verworfen (${item.kind}).`
            );
          }
        })
      : undefined;

    this.pool?.on("error", (error) => {
      console.warn(
        "[Telemetry] PostgreSQL pool connection lost; next query will reconnect:",
        error.message
      );
    });
  }

  get enabled(): boolean {
    return Boolean(this.pool);
  }

  get status(): RetryQueueStatus {
    return this.queue?.status ?? {
      pending: 0,
      dropped: 0,
      healthy: true
    };
  }

  enqueueRaw(message: RawMessage, missionId?: string): void {
    if (!this.pool) return;
    assertTelemetryPersistenceSafe(message.payload, "$.payload");
    this.enqueue("raw_message", async () => {
      await this.pool!.query(
        `INSERT INTO raw_messages (
           received_at,
           adapter_id,
           device_id,
           mission_id,
           channel,
           payload
         ) VALUES (
           to_timestamp($1 / 1000.0),
           $2,
           $3,
           $4::uuid,
           $5,
           $6::jsonb
         )`,
        [
          message.receivedAt,
          message.adapterId,
          message.deviceId ?? null,
          missionId ?? null,
          message.channel,
          JSON.stringify(message.payload ?? null)
        ]
      );
    });
  }

  enqueueParameter(
    sample: ParameterSample,
    missionId?: string,
    projectionSample: ParameterSample = sample
  ): void {
    if (!this.pool) return;
    assertParameterSamplePersistenceSafe(sample);
    this.enqueue("parameter_sample", async () => {
      await this.pool!.query(
        `INSERT INTO normalized_parameters (
           sampled_at,
           adapter_id,
           device_id,
           mission_id,
           key,
           raw_key,
           value,
           unit,
           quality
         ) VALUES (
           to_timestamp($1 / 1000.0),
           $2,
           $3,
           $4::uuid,
           $5,
           $6,
           $7::jsonb,
           $8,
           $9
         )`,
        [
          sample.sampledAt,
          sample.adapterId,
          sample.deviceId,
          missionId ?? null,
          sample.key,
          sample.rawKey ?? null,
          JSON.stringify(sample.value ?? null),
          sample.unit ?? null,
          sample.quality ?? "unknown"
        ]
      );

      const projection =
        telemetryProjectionForSample(projectionSample);
      if (missionId && projection) {
        await this.writeMissionProjection(
          missionId,
          projectionSample.deviceId,
          projectionSample.sampledAt,
          projection
        );
      }
    });
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query("SELECT 1 FROM raw_messages LIMIT 0");
      await this.pool.query(
        "SELECT 1 FROM normalized_parameters LIMIT 0"
      );
      this.queue?.kick();
      return this.queue?.status.healthy ?? true;
    } catch {
      return false;
    }
  }

  async flush(): Promise<void> {
    await this.queue?.flush();
  }

  async close(): Promise<void> {
    let failure: unknown;
    try {
      await this.queue?.shutdown();
    } catch (error) {
      failure = error;
    } finally {
      await this.pool?.end();
    }
    if (failure) throw failure;
  }

  private enqueue(
    kind: string,
    write: () => Promise<void>
  ): void {
    this.queue?.enqueue({ kind, write });
  }

  private async writeMissionProjection(
    missionId: string,
    deviceId: string,
    sampledAt: number,
    projection: TelemetryProjection
  ): Promise<void> {
    const column = projection.column;
    const values = [
      missionId,
      deviceId,
      sampledAt,
      projection.value
    ];

    const updated = await this.pool!.query(
      `UPDATE telemetry
       SET ${column} = $4
       WHERE mission_id = $1::uuid
         AND drone_sn = $2
         AND time = to_timestamp($3 / 1000.0)`,
      values
    );

    if ((updated.rowCount ?? 0) > 0) return;

    await this.pool!.query(
      `INSERT INTO telemetry (
         mission_id,
         drone_sn,
         time,
         ${column}
       ) VALUES (
         $1::uuid,
         $2,
         to_timestamp($3 / 1000.0),
         $4
       )`,
      values
    );
  }
}

export function telemetryProjectionForSample(
  sample: ParameterSample
): TelemetryProjection | undefined {
  const number = finiteNumber(sample.value);
  if (number === undefined) return undefined;

  switch (sample.key) {
    case "flight.position.latitude_deg":
      return { column: "latitude", value: number };
    case "flight.position.longitude_deg":
      return { column: "longitude", value: number };
    case "flight.altitude.ellipsoid_m":
      return { column: "height_ellipsoid", value: number };
    case "flight.altitude.relative_m":
      return { column: "elevation_relative", value: number };
    case "flight.velocity.horizontal_mps":
      return { column: "horizontal_speed", value: number };
    case "flight.velocity.vertical_mps":
      return { column: "vertical_speed", value: number };
    case "flight.attitude.yaw_deg":
      return { column: "attitude_head", value: number };
    case "flight.attitude.pitch_deg":
      return { column: "attitude_pitch", value: number };
    case "flight.attitude.roll_deg":
      return { column: "attitude_roll", value: number };
    case "navigation.gnss.fix_state_code":
      return smallIntProjection("is_fixed", number, 0, 3);
    case "navigation.gnss.quality_code":
      return smallIntProjection("quality", number);
    case "navigation.gnss.gps_satellites":
      return smallIntProjection("gps_number", number, 0);
    case "navigation.rtk.satellites":
      return smallIntProjection("rtk_number", number, 0);
    case "flight.mode.code":
      return smallIntProjection("mode_code", number);
    default:
      return undefined;
  }
}

export function assertParameterSamplePersistenceSafe(
  sample: ParameterSample
): void {
  for (const segment of sample.key.split(".")) {
    if (FORBIDDEN_KEY.test(segment)) {
      throw new Error(
        `telemetry_persistence_forbidden_key:$.key.${segment}`
      );
    }
  }
  if (sample.rawKey) {
    for (const segment of sample.rawKey.split(".")) {
      if (FORBIDDEN_KEY.test(segment)) {
        throw new Error(
          `telemetry_persistence_forbidden_key:$.rawKey.${segment}`
        );
      }
    }
  }
  assertTelemetryPersistenceSafe(sample.value, "$.value");
}

export function assertTelemetryPersistenceSafe(
  value: unknown,
  currentPath = "$"
): void {
  scanValue(value, currentPath, new Set<object>());
}

function scanValue(
  value: unknown,
  currentPath: string,
  seen: Set<object>
): void {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error(
        `telemetry_persistence_circular:${currentPath}`
      );
    }
    seen.add(value);
    value.forEach((entry, index) =>
      scanValue(entry, `${currentPath}[${index}]`, seen)
    );
    seen.delete(value);
    return;
  }

  if (typeof value !== "object" || value === null) {
    if (typeof value === "string" && RAW_BEARER.test(value)) {
      throw new Error(
        `telemetry_persistence_raw_bearer:${currentPath}`
      );
    }
    return;
  }

  if (seen.has(value)) {
    throw new Error(
      `telemetry_persistence_circular:${currentPath}`
    );
  }
  seen.add(value);

  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(
        `telemetry_persistence_forbidden_key:${childPath}`
      );
    }
    scanValue(entry, childPath, seen);
  }

  seen.delete(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function smallIntProjection(
  column: TelemetryProjection["column"],
  value: number,
  min = -32_768,
  max = 32_767
): TelemetryProjection | undefined {
  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return undefined;
  }
  return { column, value };
}
