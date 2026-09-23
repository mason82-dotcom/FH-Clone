import { Pool } from "pg";
import type { DjiProductRef } from "@fh-clone/adapter-dji-cloud";
import type { AutoMissionSession } from "./mission-session.js";

export interface MissionProductIdentity {
  product?: DjiProductRef;
}

export interface MissionStoreOptions {
  connectionString?: string;
  rtkSourceLabel?: string;
  rtkProvider?: string;
}

export class MissionStore {
  private readonly pool: Pool | undefined;
  private readonly rtkSourceLabel: string | undefined;
  private readonly rtkProvider: string | undefined;

  constructor(options: MissionStoreOptions = {}) {
    this.pool = options.connectionString
      ? new Pool({
          connectionString: options.connectionString,
          max: 5,
          idleTimeoutMillis: 30_000
        })
      : undefined;

    this.pool?.on("error", (error) => {
      console.warn(
        "[Mission] PostgreSQL pool connection lost; next query will reconnect:",
        error.message
      );
    });

    this.rtkSourceLabel = clean(options.rtkSourceLabel);
    this.rtkProvider = clean(options.rtkProvider);
  }

  get enabled(): boolean {
    return Boolean(this.pool);
  }

  async open(
    session: AutoMissionSession,
    identity: MissionProductIdentity = {}
  ): Promise<void> {
    if (!this.pool) return;

    const product = identity.product;
    const domain = numericDomain(product?.domain);

    await this.pool.query(
      `INSERT INTO missions (
         mission_id,
         source,
         gateway_sn,
         drone_sn,
         product_domain,
         device_type,
         device_sub_type,
         started_at,
         rtk_source_label,
         rtk_provider,
         rtk_configured_via
       ) VALUES (
         $1::uuid,
         'automatic',
         $2,
         $3,
         $4,
         $5,
         $6,
         to_timestamp($7 / 1000.0),
         $8,
         $9,
         CASE WHEN $8 IS NULL THEN NULL ELSE 'dji-pilot-2' END
       )
       ON CONFLICT (mission_id) DO NOTHING`,
      [
        session.missionId,
        session.gatewaySn ?? null,
        session.deviceId,
        domain,
        product?.type ?? null,
        product?.subType ?? null,
        session.startedAt,
        this.rtkSourceLabel ?? null,
        this.rtkProvider ?? null
      ]
    );
  }

  async closeSession(session: AutoMissionSession): Promise<void> {
    if (!this.pool || session.endedAt === undefined) return;

    await this.pool.query(
      `UPDATE missions
       SET ended_at = to_timestamp($2 / 1000.0),
           end_reason = $3,
           gateway_sn = COALESCE(gateway_sn, $4)
       WHERE mission_id = $1::uuid`,
      [
        session.missionId,
        session.endedAt,
        session.endReason ?? "manual",
        session.gatewaySn ?? null
      ]
    );
  }

  async recoverOpenAutomaticSessions(endedAt = Date.now()): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.pool.query(
      `UPDATE missions
       SET ended_at = to_timestamp($1 / 1000.0),
           end_reason = 'service_restart'
       WHERE source = 'automatic'
         AND ended_at IS NULL`,
      [endedAt]
    );

    return result.rowCount ?? 0;
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

function numericDomain(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
