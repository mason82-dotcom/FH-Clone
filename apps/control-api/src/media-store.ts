import { Pool } from "pg";
import type { MediaAsset } from "@fh-clone/aircraft-core";
import { isMediaAsset } from "./media-overlay.js";

const FORBIDDEN_METADATA_KEY =
  /^(?:authorization|bearer(?:token)?|password|secret|token|api[_-]?key|client[_-]?secret|device[_-]?secret|nonce)$/i;
const RAW_BEARER =
  /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i;

export interface MediaStoreOptions {
  connectionString?: string;
}

export class MediaStore {
  private readonly pool: Pool | undefined;

  constructor(options: MediaStoreOptions = {}) {
    this.pool = options.connectionString
      ? new Pool({
          connectionString: options.connectionString,
          max: 3,
          idleTimeoutMillis: 30_000
        })
      : undefined;

    this.pool?.on("error", (error) => {
      console.warn(
        "[Media] PostgreSQL pool connection lost; next query will reconnect:",
        error.message
      );
    });
  }

  get enabled(): boolean {
    return Boolean(this.pool);
  }

  async upsert(asset: MediaAsset): Promise<void> {
    if (!this.pool) return;
    assertMediaAssetPersistenceSafe(asset);

    await this.pool.query(
      `INSERT INTO media_assets (
         asset_id,
         device_sn,
         sensor_id,
         sensor_kind,
         profile,
         captured_at,
         mission_id,
         payload_id,
         latitude,
         longitude,
         asset
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         CASE
           WHEN $6::double precision IS NULL THEN NULL
           ELSE to_timestamp($6 / 1000.0)
         END,
         $7,
         $8,
         $9,
         $10,
         $11::jsonb
       )
       ON CONFLICT (asset_id) DO UPDATE
       SET device_sn = EXCLUDED.device_sn,
           sensor_id = EXCLUDED.sensor_id,
           sensor_kind = EXCLUDED.sensor_kind,
           profile = EXCLUDED.profile,
           captured_at = EXCLUDED.captured_at,
           mission_id = EXCLUDED.mission_id,
           payload_id = EXCLUDED.payload_id,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           asset = EXCLUDED.asset,
           updated_at = now()`,
      [
        asset.id,
        asset.capture.deviceId,
        asset.sensor.id,
        asset.sensor.kind,
        asset.profile,
        asset.capture.capturedAt ?? null,
        asset.capture.missionId ?? null,
        asset.capture.payloadId ?? asset.sensor.payloadId ?? null,
        asset.capture.latitudeDeg ?? null,
        asset.capture.longitudeDeg ?? null,
        JSON.stringify(asset)
      ]
    );
  }

  async upsertMany(assets: readonly MediaAsset[]): Promise<void> {
    if (!this.pool) return;
    for (const asset of assets) {
      await this.upsert(asset);
    }
  }

  async list(): Promise<MediaAsset[]> {
    if (!this.pool) return [];

    const result = await this.pool.query<{
      asset: unknown;
    }>(
      `SELECT asset
       FROM media_assets
       ORDER BY captured_at DESC NULLS LAST, updated_at DESC, asset_id ASC`
    );

    const assets: MediaAsset[] = [];
    for (const row of result.rows) {
      if (isMediaAsset(row.asset)) {
        assets.push(row.asset);
      } else {
        console.warn(
          "[Media] Persisted media asset ignored because it no longer matches the runtime contract."
        );
      }
    }
    return assets;
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query("SELECT 1 FROM media_assets LIMIT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

export function assertMediaAssetPersistenceSafe(
  asset: MediaAsset
): void {
  scanPersistenceValue(asset, "$");
}

function scanPersistenceValue(
  value: unknown,
  currentPath: string
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanPersistenceValue(entry, `${currentPath}[${index}]`)
    );
    return;
  }

  if (
    typeof value !== "object" ||
    value === null
  ) {
    if (
      typeof value === "string" &&
      RAW_BEARER.test(value)
    ) {
      throw new Error(
        `media_persistence_raw_bearer:${currentPath}`
      );
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error(
        `media_persistence_forbidden_key:${childPath}`
      );
    }
    scanPersistenceValue(entry, childPath);
  }
}
