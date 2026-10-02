import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

import type {
  MappingAgentClaimInput,
  MappingAgentHeartbeatInput,
  MappingJob,
  MappingJobCreateInput,
  MappingResultManifest,
  MappingSourceAsset
} from "./mapping-model.js";

const ACTIVE_STATUSES = ["CLAIMED", "RUNNING"] as const;

interface MappingStoreOptions {
  connectionString?: string;
  maxLeaseAttempts?: number;
  defaultLeaseSeconds?: number;
}

interface MappingJobRow {
  id: string;
  name: string;
  status: MappingJob["status"];
  asset_ids: string[];
  options: Record<string, unknown>;
  mission_id: string | null;
  device_sn: string | null;
  created_by: string;
  agent_id: string | null;
  lease_until: Date | null;
  attempts: number;
  progress: number;
  message: string | null;
  error: string | null;
  claimed_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MappingClaim {
  job: MappingJob;
  sources: MappingSourceAsset[];
  capabilities: Record<string, unknown>;
}

export interface MappingLayer {
  id: string;
  jobId?: string;
  name: string;
  layerType: "xyz" | "cog";
  objectPrefix: string;
  tileFormat?: string;
  minZoom?: number;
  maxZoom?: number;
  boundsWgs84?: [number, number, number, number];
  crs?: string;
  opacity: number;
  createdAt: string;
}

interface MappingLayerRow {
  id: string;
  job_id: string | null;
  name: string;
  layer_type: "xyz" | "cog";
  object_prefix: string;
  tile_format: string | null;
  min_zoom: number | null;
  max_zoom: number | null;
  bounds_wgs84: unknown;
  crs: string | null;
  opacity: number;
  created_at: Date;
}

export class MappingLeaseConflict extends Error {
  constructor() {
    super("mapping_job_not_leased_to_agent");
  }
}

export class MappingSourceAssetError extends Error {
  constructor(
    message: string,
    readonly assetIds: string[]
  ) {
    super(message);
  }
}

export class MappingStore {
  private readonly pool: Pool | undefined;
  private readonly maxLeaseAttempts: number;
  private readonly defaultLeaseSeconds: number;

  constructor(options: MappingStoreOptions = {}) {
    this.maxLeaseAttempts = boundedInteger(
      options.maxLeaseAttempts ?? 3,
      1,
      100,
      "maxLeaseAttempts"
    );
    this.defaultLeaseSeconds = boundedInteger(
      options.defaultLeaseSeconds ?? 600,
      10,
      3_600,
      "defaultLeaseSeconds"
    );
    this.pool = options.connectionString
      ? new Pool({
          connectionString: options.connectionString,
          max: 4,
          idleTimeoutMillis: 30_000
        })
      : undefined;

    this.pool?.on("error", (error) => {
      console.warn(
        "[Mapping] PostgreSQL pool connection lost; next query will reconnect:",
        error.message
      );
    });
  }

  get enabled(): boolean {
    return Boolean(this.pool);
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query("SELECT 1 FROM mapping_jobs LIMIT 1");
      return true;
    } catch {
      return false;
    }
  }

  async create(
    input: MappingJobCreateInput,
    createdBy = "api"
  ): Promise<MappingJob> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await this.resolveSources(client, input.assetIds);

      const id = randomUUID();
      const options = {
        profile: input.profile ?? "standard",
        odm: input.odmOptions ?? {}
      };
      const result = await client.query<MappingJobRow>(
        `INSERT INTO mapping_jobs (
           id,
           name,
           status,
           asset_ids,
           options,
           mission_id,
           device_sn,
           created_by
         ) VALUES (
           $1,
           $2,
           'QUEUED',
           $3,
           $4::jsonb,
           $5,
           $6,
           $7
         )
         RETURNING *`,
        [
          id,
          input.name,
          input.assetIds,
          JSON.stringify(options),
          input.missionId ?? null,
          input.deviceSn ?? null,
          createdBy
        ]
      );
      await client.query("COMMIT");
      return rowToJob(requiredRow(result.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(limit = 200): Promise<MappingJob[]> {
    const pool = this.requirePool();
    const safeLimit = boundedInteger(limit, 1, 500, "limit");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await this.requeueExpired(client);
      const result = await client.query<MappingJobRow>(
        `SELECT *
         FROM mapping_jobs
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
        [safeLimit]
      );
      await client.query("COMMIT");
      return result.rows.map(rowToJob);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(jobId: string): Promise<MappingJob | undefined> {
    const pool = this.requirePool();
    const result = await pool.query<MappingJobRow>(
      "SELECT * FROM mapping_jobs WHERE id = $1",
      [jobId]
    );
    const row = result.rows[0];
    return row ? rowToJob(row) : undefined;
  }


  async listLayers(): Promise<MappingLayer[]> {
    const pool = this.requirePool();
    const result = await pool.query<MappingLayerRow>(
      `SELECT *
       FROM mapping_layers
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows.map(rowToLayer);
  }

  async getLayer(layerId: string): Promise<MappingLayer | undefined> {
    const pool = this.requirePool();
    const result = await pool.query<MappingLayerRow>(
      "SELECT * FROM mapping_layers WHERE id = $1",
      [layerId]
    );
    const row = result.rows[0];
    return row ? rowToLayer(row) : undefined;
  }

  async resolveSourceAssets(
    assetIds: readonly string[]
  ): Promise<MappingSourceAsset[]> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      return await this.resolveSources(client, assetIds);
    } finally {
      client.release();
    }
  }

  async claim(input: MappingAgentClaimInput): Promise<MappingClaim | undefined> {
    const pool = this.requirePool();
    const leaseSeconds = input.leaseSeconds ?? this.defaultLeaseSeconds;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await this.requeueExpired(client);

      const selected = await client.query<MappingJobRow>(
        `SELECT *
         FROM mapping_jobs
         WHERE status = 'QUEUED'
         ORDER BY created_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );
      const current = selected.rows[0];
      if (!current) {
        await client.query("COMMIT");
        return undefined;
      }

      const updated = await client.query<MappingJobRow>(
        `UPDATE mapping_jobs
         SET status = 'CLAIMED',
             agent_id = $2,
             lease_until = now() + ($3 * interval '1 second'),
             claimed_at = now(),
             message = $4,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          current.id,
          input.agentId,
          leaseSeconds,
          `claimed by ${input.agentId}`.slice(0, 500)
        ]
      );

      const job = requiredRow(updated.rows[0]);
      const sources = await this.resolveSources(client, job.asset_ids);
      await client.query("COMMIT");

      return {
        job: rowToJob(job),
        sources,
        capabilities: input.capabilities ?? {}
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(
    jobId: string,
    input: MappingAgentHeartbeatInput
  ): Promise<MappingJob> {
    const pool = this.requirePool();
    const leaseSeconds = input.leaseSeconds ?? this.defaultLeaseSeconds;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await this.lockActiveLease(client, jobId, input.agentId);
      const updated = await client.query<MappingJobRow>(
        `UPDATE mapping_jobs
         SET status = 'RUNNING',
             progress = $2,
             message = $3,
             lease_until = now() + ($4 * interval '1 second'),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [jobId, input.progress, input.message ?? null, leaseSeconds]
      );
      await client.query("COMMIT");
      return rowToJob(requiredRow(updated.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async leaseSources(
    jobId: string,
    agentId: string
  ): Promise<MappingSourceAsset[]> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = await this.lockActiveLease(client, jobId, agentId);
      const sources = await this.resolveSources(client, job.asset_ids);
      await client.query("COMMIT");
      return sources;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async assertActiveLease(jobId: string, agentId: string): Promise<void> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockActiveLease(client, jobId, agentId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeWithManifest(
    jobId: string,
    agentId: string,
    manifest: MappingResultManifest
  ): Promise<{ job: MappingJob; layerId?: string }> {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await this.lockActiveLease(client, jobId, agentId);

      for (const file of manifest.files) {
        await client.query(
          `INSERT INTO mapping_results (
             job_id,
             kind,
             object_key,
             sha256,
             size_bytes,
             metadata
           ) VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             '{}'::jsonb
           )
           ON CONFLICT (job_id, object_key) DO UPDATE
           SET kind = EXCLUDED.kind,
               sha256 = EXCLUDED.sha256,
               size_bytes = EXCLUDED.size_bytes`,
          [
            jobId,
            file.kind,
            `${jobId}/${file.path}`,
            file.sha256 ?? null,
            file.size ?? null
          ]
        );
      }

      let layerId: string | undefined;
      if (manifest.tiles) {
        layerId = randomUUID();
        await client.query(
          `INSERT INTO mapping_layers (
             id,
             job_id,
             name,
             layer_type,
             object_prefix,
             tile_format,
             min_zoom,
             max_zoom,
             bounds_wgs84,
             crs
           ) VALUES (
             $1,
             $2,
             $3,
             'xyz',
             $4,
             $5,
             $6,
             $7,
             $8::jsonb,
             $9
           )`,
          [
            layerId,
            jobId,
            current.name,
            `${jobId}/${manifest.tiles.path}`,
            manifest.tiles.format,
            manifest.tiles.minzoom,
            manifest.tiles.maxzoom,
            manifest.boundsWgs84 ? JSON.stringify(manifest.boundsWgs84) : null,
            manifest.crs ?? null
          ]
        );
      }

      const updated = await client.query<MappingJobRow>(
        `UPDATE mapping_jobs
         SET status = 'DONE',
             progress = 100,
             message = 'completed',
             error = NULL,
             lease_until = NULL,
             agent_id = NULL,
             finished_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [jobId]
      );
      await client.query("COMMIT");
      return {
        job: rowToJob(requiredRow(updated.rows[0])),
        ...(layerId ? { layerId } : {})
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(
    jobId: string,
    agentId: string,
    errorMessage: string
  ): Promise<MappingJob> {
    return this.finish(jobId, agentId, "FAILED", errorMessage.slice(0, 2_000));
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  private async finish(
    jobId: string,
    agentId: string,
    status: "DONE" | "FAILED",
    error?: string
  ): Promise<MappingJob> {
    const pool = this.requirePool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await this.lockActiveLease(client, jobId, agentId);
      const updated = await client.query<MappingJobRow>(
        `UPDATE mapping_jobs
         SET status = $2,
             progress = CASE WHEN $2 = 'DONE' THEN 100 ELSE progress END,
             message = CASE WHEN $2 = 'DONE' THEN 'completed' ELSE 'failed' END,
             error = $3,
             lease_until = NULL,
             agent_id = NULL,
             finished_at = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [jobId, status, error ?? null]
      );
      await client.query("COMMIT");
      return rowToJob(requiredRow(updated.rows[0]));
    } catch (caught) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw caught;
    } finally {
      client.release();
    }
  }

  private async requeueExpired(client: PoolClient): Promise<number> {
    const result = await client.query(
      `UPDATE mapping_jobs
       SET status = CASE
             WHEN attempts + 1 >= $1 THEN 'FAILED'
             ELSE 'QUEUED'
           END,
           error = CASE
             WHEN attempts + 1 >= $1
             THEN 'lease expired ' || (attempts + 1)::text || ' times'
             ELSE error
           END,
           finished_at = CASE
             WHEN attempts + 1 >= $1 THEN now()
             ELSE NULL
           END,
           message = 'lease of ' || COALESCE(agent_id, 'unknown') || ' expired',
           agent_id = NULL,
           lease_until = NULL,
           updated_at = now(),
           attempts = attempts + 1
       WHERE status = ANY($2::text[])
         AND lease_until < now()`,
      [this.maxLeaseAttempts, ACTIVE_STATUSES]
    );
    return result.rowCount ?? 0;
  }

  private async lockActiveLease(
    client: PoolClient,
    jobId: string,
    agentId: string
  ): Promise<MappingJobRow> {
    const result = await client.query<MappingJobRow>(
      `SELECT *
       FROM mapping_jobs
       WHERE id = $1
       FOR UPDATE`,
      [jobId]
    );
    const row = result.rows[0];
    if (
      !row ||
      !ACTIVE_STATUSES.includes(row.status as typeof ACTIVE_STATUSES[number]) ||
      row.agent_id !== agentId ||
      !row.lease_until ||
      row.lease_until.getTime() <= Date.now()
    ) {
      throw new MappingLeaseConflict();
    }
    return row;
  }

  private async resolveSources(
    client: PoolClient,
    assetIds: readonly string[]
  ): Promise<MappingSourceAsset[]> {
    const result = await client.query<{
      asset_id: string;
      object_key: string | null;
      file_name: string | null;
    }>(
      `SELECT
         asset_id,
         NULLIF(asset ->> 'objectKey', '') AS object_key,
         NULLIF(asset ->> 'fileName', '') AS file_name
       FROM media_assets
       WHERE asset_id = ANY($1::text[])`,
      [assetIds]
    );

    const byId = new Map(result.rows.map((row) => [row.asset_id, row]));
    const missing = assetIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new MappingSourceAssetError("mapping_media_assets_missing", [...missing]);
    }

    const withoutObjectKey = assetIds.filter((id) => !byId.get(id)?.object_key);
    if (withoutObjectKey.length > 0) {
      throw new MappingSourceAssetError(
        "mapping_media_assets_without_object_key",
        [...withoutObjectKey]
      );
    }

    return assetIds.map((assetId) => {
      const row = byId.get(assetId)!;
      return {
        assetId,
        objectKey: row.object_key!,
        ...(row.file_name ? { fileName: row.file_name } : {})
      };
    });
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error("mapping_store_not_configured");
    return this.pool;
  }
}

function rowToJob(row: MappingJobRow): MappingJob {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    assetIds: row.asset_ids,
    options: row.options,
    ...(row.mission_id ? { missionId: row.mission_id } : {}),
    ...(row.device_sn ? { deviceSn: row.device_sn } : {}),
    createdBy: row.created_by,
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.lease_until ? { leaseUntil: row.lease_until.toISOString() } : {}),
    attempts: row.attempts,
    progress: Number(row.progress),
    ...(row.message ? { message: row.message } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.claimed_at ? { claimedAt: row.claimed_at.toISOString() } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function rowToLayer(row: MappingLayerRow): MappingLayer {
  const bounds = Array.isArray(row.bounds_wgs84) &&
    row.bounds_wgs84.length === 4 &&
    row.bounds_wgs84.every(
      (value) => typeof value === "number" && Number.isFinite(value)
    )
    ? row.bounds_wgs84 as [number, number, number, number]
    : undefined;

  return {
    id: row.id,
    ...(row.job_id ? { jobId: row.job_id } : {}),
    name: row.name,
    layerType: row.layer_type,
    objectPrefix: row.object_prefix,
    ...(row.tile_format ? { tileFormat: row.tile_format } : {}),
    ...(row.min_zoom !== null ? { minZoom: row.min_zoom } : {}),
    ...(row.max_zoom !== null ? { maxZoom: row.max_zoom } : {}),
    ...(bounds ? { boundsWgs84: bounds } : {}),
    ...(row.crs ? { crs: row.crs } : {}),
    opacity: Number(row.opacity),
    createdAt: row.created_at.toISOString()
  };
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw new Error("mapping_store_expected_row");
  return row;
}

function boundedInteger(
  value: number,
  min: number,
  max: number,
  field: string
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field}_out_of_range`);
  }
  return value;
}
