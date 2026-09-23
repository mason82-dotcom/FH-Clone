import { isIP } from "node:net";

import { Pool } from "pg";

import type {
  AuthzReason,
  EmqxAuthorizationResult
} from "./authz.js";

export interface AuthzAuditRecord {
  timeMs: number;
  decision: EmqxAuthorizationResult;
  reason: AuthzReason;
  action: string;
  topic: string;
  qos?: string | number;
  username?: string;
  clientId?: string;
  peerIp?: string;
  gatewaySn?: string;
  aircraftSn?: string;
  drcSessionId?: string;
  missionId?: string;
  /**
   * Every record produced by this HTTP hook is a cache miss by definition:
   * a true EMQX authorization-cache hit never reaches the backend hook.
   */
  cacheHit: false;
  latencyUs?: number;
}

export interface AuthzAuditWriterOptions {
  connectionString?: string;
  capacity?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  writeJsonl?: (line: string) => void;
  writeBatch?: (records: AuthzAuditRecord[]) => Promise<void>;
}

export interface AuthzAuditWriterStatus {
  pending: number;
  droppedFromDatabaseBuffer: number;
  databaseEnabled: boolean;
}

export class AuthzAuditWriter {
  private readonly pool: Pool | undefined;
  private readonly capacity: number;
  private readonly batchSize: number;
  private readonly writeJsonl: (line: string) => void;
  private readonly writeBatch: ((records: AuthzAuditRecord[]) => Promise<void>) | undefined;
  private readonly buffer: AuthzAuditRecord[] = [];
  private readonly timer: NodeJS.Timeout | undefined;
  private flushPromise: Promise<void> | undefined;
  private droppedFromDatabaseBuffer = 0;
  private closed = false;

  constructor(options: AuthzAuditWriterOptions = {}) {
    this.capacity = options.capacity ?? 10_000;
    this.batchSize = options.batchSize ?? 500;
    this.writeJsonl =
      options.writeJsonl ?? ((line) => process.stdout.write(line + "\n"));

    if (this.capacity <= 0) throw new RangeError("capacity must be > 0");
    if (this.batchSize <= 0) throw new RangeError("batchSize must be > 0");

    if (options.writeBatch) {
      this.writeBatch = options.writeBatch;
    } else if (options.connectionString) {
      this.pool = new Pool({
        connectionString: options.connectionString,
        max: 2,
        idleTimeoutMillis: 30_000
      });
      this.pool.on("error", (error) => {
        console.warn(
          "[AuthZ Audit] PostgreSQL pool connection lost; next flush will retry:",
          error.message
        );
      });
      this.writeBatch = (records) => this.insertBatch(records);
    }

    if (this.writeBatch) {
      const intervalMs = options.flushIntervalMs ?? 2_000;
      if (intervalMs <= 0) {
        throw new RangeError("flushIntervalMs must be > 0");
      }
      this.timer = setInterval(() => {
        void this.flush().catch((error) => {
          console.error("[AuthZ Audit] Flush fehlgeschlagen:", errorMessage(error));
        });
      }, intervalMs);
      this.timer.unref();
    }
  }

  get status(): AuthzAuditWriterStatus {
    return {
      pending: this.buffer.length,
      droppedFromDatabaseBuffer: this.droppedFromDatabaseBuffer,
      databaseEnabled: Boolean(this.writeBatch)
    };
  }

  enqueue(record: AuthzAuditRecord): void {
    if (this.closed) return;

    // JSONL is deliberately independent of database availability.
    this.writeJsonl(JSON.stringify(toJsonRecord(record)));

    if (!this.writeBatch || !shouldPersistAuthzRecord(record)) return;

    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
      this.droppedFromDatabaseBuffer += 1;
      if (
        this.droppedFromDatabaseBuffer === 1 ||
        this.droppedFromDatabaseBuffer % 100 === 0
      ) {
        console.error(
          "[AuthZ Audit] DB-Ringbuffer voll; ältester Eintrag verworfen.",
          { dropped: this.droppedFromDatabaseBuffer }
        );
      }
    }

    this.buffer.push({ ...record });
    if (this.buffer.length >= this.batchSize) {
      queueMicrotask(() => {
        void this.flush().catch((error) => {
          console.error("[AuthZ Audit] Batch-Flush fehlgeschlagen:", errorMessage(error));
        });
      });
    }
  }

  async flush(): Promise<void> {
    if (!this.writeBatch || this.buffer.length === 0) return;
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = this.flushOneBatch().finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);

    if (this.flushPromise) {
      await this.flushPromise;
    }

    while (this.writeBatch && this.buffer.length > 0) {
      const before = this.buffer.length;
      await this.flush();
      if (this.buffer.length >= before) {
        // Database remains unavailable. JSONL was already emitted for every
        // record, so shutdown must not hang forever.
        break;
      }
    }

    await this.pool?.end();
  }

  private async flushOneBatch(): Promise<void> {
    if (!this.writeBatch || this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);
    try {
      await this.writeBatch(batch);
    } catch (error) {
      const free = Math.max(0, this.capacity - this.buffer.length);
      const restore = batch.slice(Math.max(0, batch.length - free));
      this.buffer.unshift(...restore);
      const lost = batch.length - restore.length;
      if (lost > 0) this.droppedFromDatabaseBuffer += lost;
      throw error;
    }
  }

  private async insertBatch(records: AuthzAuditRecord[]): Promise<void> {
    if (!this.pool || records.length === 0) return;

    const values: unknown[] = [];
    const tuples = records.map((record, row) => {
      const offset = row * 15;
      values.push(
        new Date(record.timeMs),
        record.decision,
        record.reason,
        record.action,
        record.topic,
        normalizeQos(record.qos),
        clean(record.username),
        clean(record.clientId),
        normalizePeerIp(record.peerIp),
        clean(record.gatewaySn),
        clean(record.aircraftSn),
        clean(record.drcSessionId),
        clean(record.missionId),
        false,
        normalizeLatency(record.latencyUs)
      );
      return `(${Array.from({ length: 15 }, (_, column) => `$${offset + column + 1}`).join(", ")})`;
    });

    await this.pool.query(
      `INSERT INTO authz_audit (
         time,
         decision,
         reason,
         action,
         topic,
         qos,
         username,
         client_id,
         peer_ip,
         gateway_sn,
         aircraft_sn,
         drc_session_id,
         mission_id,
         cache_hit,
         latency_us
       ) VALUES ${tuples.join(", ")}`,
      values
    );
  }
}

export function shouldPersistAuthzRecord(record: AuthzAuditRecord): boolean {
  if (record.decision !== "allow") return true;
  return /\/(?:drc\/up|drc\/down|services|property\/set)$/.test(record.topic);
}

function toJsonRecord(record: AuthzAuditRecord): Record<string, unknown> {
  return {
    type: "authz_audit",
    time: new Date(record.timeMs).toISOString(),
    decision: record.decision,
    reason: record.reason,
    action: record.action,
    topic: record.topic,
    ...(record.qos !== undefined ? { qos: normalizeQos(record.qos) } : {}),
    ...(clean(record.username) ? { username: clean(record.username) } : {}),
    ...(clean(record.clientId) ? { client_id: clean(record.clientId) } : {}),
    ...(normalizePeerIp(record.peerIp)
      ? { peer_ip: normalizePeerIp(record.peerIp) }
      : {}),
    ...(clean(record.gatewaySn) ? { gateway_sn: clean(record.gatewaySn) } : {}),
    ...(clean(record.aircraftSn) ? { aircraft_sn: clean(record.aircraftSn) } : {}),
    ...(clean(record.drcSessionId)
      ? { drc_session_id: clean(record.drcSessionId) }
      : {}),
    ...(clean(record.missionId) ? { mission_id: clean(record.missionId) } : {}),
    cache_hit: false,
    ...(record.latencyUs !== undefined
      ? { latency_us: normalizeLatency(record.latencyUs) }
      : {})
  };
}

function normalizeQos(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 2 ? parsed : null;
}

function normalizeLatency(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function normalizePeerIp(value: string | undefined): string | null {
  const trimmed = clean(value);
  return trimmed && isIP(trimmed) !== 0 ? trimmed : null;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
