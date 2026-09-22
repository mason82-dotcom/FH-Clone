import { isIP } from "node:net";

import { Pool } from "pg";

import type {
  AuthzDecisionReason,
  EmqxAuthorizationResult
} from "./authz.js";

export interface AuthzAuditRecord {
  timeMs: number;
  decision: EmqxAuthorizationResult;
  reason: AuthzDecisionReason;
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
  shutdownFlushAttempts?: number;
  shutdownRetryDelayMs?: number;
  writeJsonl?: (line: string) => void;
  writeBatch?: (records: AuthzAuditRecord[]) => Promise<void>;
}

export interface AuthzAuditWriterStatus {
  pending: number;
  droppedFromDatabaseBuffer: number;
  databaseEnabled: boolean;
}

class AuthzAuditRingBuffer {
  private readonly slots: Array<AuthzAuditRecord | undefined>;
  private head = 0;
  private length = 0;

  constructor(readonly capacity: number) {
    this.slots = new Array<AuthzAuditRecord | undefined>(capacity);
  }

  get size(): number {
    return this.length;
  }

  /**
   * Appends one record while respecting a temporary logical limit.
   * Returns true when a record had to be dropped.
   */
  push(record: AuthzAuditRecord, logicalLimit = this.capacity): boolean {
    const limit = Math.max(0, Math.min(this.capacity, logicalLimit));
    if (limit === 0) return true;

    let dropped = false;
    if (this.length >= limit) {
      this.shiftOne();
      dropped = true;
    }

    const tail = (this.head + this.length) % this.capacity;
    this.slots[tail] = { ...record };
    this.length += 1;
    return dropped;
  }

  shiftMany(limit: number): AuthzAuditRecord[] {
    const count = Math.min(Math.max(0, limit), this.length);
    const result: AuthzAuditRecord[] = [];
    for (let index = 0; index < count; index += 1) {
      const value = this.shiftOne();
      if (value) result.push(value);
    }
    return result;
  }

  prependMany(records: readonly AuthzAuditRecord[]): void {
    if (records.length + this.length > this.capacity) {
      throw new Error("AuthZ audit ringbuffer restore would exceed capacity");
    }

    for (let index = records.length - 1; index >= 0; index -= 1) {
      this.head = (this.head - 1 + this.capacity) % this.capacity;
      this.slots[this.head] = { ...records[index]! };
      this.length += 1;
    }
  }

  private shiftOne(): AuthzAuditRecord | undefined {
    if (this.length === 0) return undefined;
    const value = this.slots[this.head];
    this.slots[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.length -= 1;
    return value;
  }
}

export class AuthzAuditWriter {
  private readonly pool: Pool | undefined;
  private readonly capacity: number;
  private readonly batchSize: number;
  private readonly shutdownFlushAttempts: number;
  private readonly shutdownRetryDelayMs: number;
  private readonly writeJsonl: (line: string) => void;
  private readonly writeBatch:
    | ((records: AuthzAuditRecord[]) => Promise<void>)
    | undefined;
  private readonly buffer: AuthzAuditRingBuffer;
  private readonly timer: NodeJS.Timeout | undefined;
  private flushPromise: Promise<void> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private flushScheduled = false;
  private inFlightCount = 0;
  private droppedFromDatabaseBuffer = 0;
  private closed = false;

  constructor(options: AuthzAuditWriterOptions = {}) {
    this.capacity = options.capacity ?? 10_000;
    this.batchSize = options.batchSize ?? 500;
    this.shutdownFlushAttempts = options.shutdownFlushAttempts ?? 3;
    this.shutdownRetryDelayMs = options.shutdownRetryDelayMs ?? 100;
    this.writeJsonl =
      options.writeJsonl ?? ((line) => process.stdout.write(line + "\n"));

    if (this.capacity <= 0) throw new RangeError("capacity must be > 0");
    if (this.batchSize <= 0) throw new RangeError("batchSize must be > 0");
    if (this.shutdownFlushAttempts <= 0) {
      throw new RangeError("shutdownFlushAttempts must be > 0");
    }
    if (this.shutdownRetryDelayMs < 0) {
      throw new RangeError("shutdownRetryDelayMs must be >= 0");
    }

    this.buffer = new AuthzAuditRingBuffer(this.capacity);

    if (options.writeBatch) {
      this.writeBatch = options.writeBatch;
    } else if (options.connectionString) {
      this.pool = new Pool({
        connectionString: options.connectionString,
        max: 2,
        idleTimeoutMillis: 30_000
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
          console.error(
            "[AuthZ Audit] Flush fehlgeschlagen:",
            errorMessage(error)
          );
        });
      }, intervalMs);
      this.timer.unref();
    }
  }

  get status(): AuthzAuditWriterStatus {
    return {
      pending: this.buffer.size + this.inFlightCount,
      droppedFromDatabaseBuffer: this.droppedFromDatabaseBuffer,
      databaseEnabled: Boolean(this.writeBatch)
    };
  }

  enqueue(record: AuthzAuditRecord): void {
    if (this.closed) return;

    // JSONL is deliberately independent of database availability.
    this.writeJsonl(JSON.stringify(toJsonRecord(record)));

    if (!this.writeBatch || !shouldPersistAuthzRecord(record)) return;

    // Reserve capacity for the batch currently in flight. This keeps total
    // buffered + in-flight records bounded by capacity and guarantees that a
    // failed batch can be restored at the front without losing older records.
    const pendingLimit = this.capacity - this.inFlightCount;
    if (this.buffer.push(record, pendingLimit)) {
      this.noteDroppedRecord();
    }

    if (this.buffer.size >= this.batchSize) {
      this.scheduleFlush();
    }
  }

  /**
   * Flushes the records that were pending when this call started.
   * New records may remain queued for the next batch.
   */
  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    if (!this.writeBatch || this.buffer.size === 0) return;

    const targetCount = this.buffer.size;
    this.flushPromise = this.flushSnapshot(targetCount).finally(() => {
      this.flushPromise = undefined;
    });
    return this.flushPromise;
  }

  /**
   * Stops accepting new audit records and drains every retained DB record.
   * A DB outage is never silently treated as success: after the configured
   * retry attempts shutdown rejects, allowing the process to exit non-zero.
   */
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.shutdownInternal();
    return this.shutdownPromise;
  }

  private async shutdownInternal(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);

    let lastError: unknown;
    let failedAttempts = 0;

    try {
      if (this.flushPromise) {
        try {
          await this.flushPromise;
        } catch (error) {
          lastError = error;
        }
      }

      while (this.writeBatch && this.buffer.size > 0) {
        try {
          await this.flush();
          failedAttempts = 0;
          lastError = undefined;
        } catch (error) {
          lastError = error;
          failedAttempts += 1;
          if (failedAttempts >= this.shutdownFlushAttempts) {
            throw new Error(
              `AuthZ audit shutdown flush failed after ${failedAttempts} attempt(s)`,
              { cause: error }
            );
          }
          if (this.shutdownRetryDelayMs > 0) {
            await delay(this.shutdownRetryDelayMs);
          }
        }
      }

      if (lastError !== undefined && this.buffer.size > 0) {
        throw lastError;
      }
    } finally {
      await this.pool?.end();
    }
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.closed) return;
    this.flushScheduled = true;

    queueMicrotask(() => {
      this.flushScheduled = false;
      void this.flush()
        .then(() => {
          if (!this.closed && this.buffer.size >= this.batchSize) {
            this.scheduleFlush();
          }
        })
        .catch((error) => {
          // Keep the failed batch in the ringbuffer. The periodic flush or
          // shutdown path retries; do not spin in a hot retry loop here.
          console.error(
            "[AuthZ Audit] Batch-Flush fehlgeschlagen:",
            errorMessage(error)
          );
        });
    });
  }

  private async flushSnapshot(targetCount: number): Promise<void> {
    if (!this.writeBatch) return;

    let remaining = targetCount;
    while (remaining > 0 && this.buffer.size > 0) {
      const batch = this.buffer.shiftMany(
        Math.min(this.batchSize, remaining)
      );
      if (batch.length === 0) return;

      this.inFlightCount = batch.length;
      try {
        await this.writeBatch(batch);
        remaining -= batch.length;
      } catch (error) {
        // enqueue() reserved in-flight capacity, so restoring at the front is
        // guaranteed to fit and preserves FIFO order for every retained record.
        this.buffer.prependMany(batch);
        throw error;
      } finally {
        this.inFlightCount = 0;
      }
    }
  }

  private noteDroppedRecord(): void {
    this.droppedFromDatabaseBuffer += 1;
    if (
      this.droppedFromDatabaseBuffer === 1 ||
      this.droppedFromDatabaseBuffer % 100 === 0
    ) {
      console.error(
        "[AuthZ Audit] DB-Ringbuffer voll; Eintrag verworfen.",
        { dropped: this.droppedFromDatabaseBuffer }
      );
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
        record.cacheHit,
        normalizeLatency(record.latencyUs)
      );
      return `(${Array.from(
        { length: 15 },
        (_, column) => `$${offset + column + 1}`
      ).join(", ")})`;
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
    cache_hit: record.cacheHit,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
