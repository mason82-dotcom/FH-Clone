import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthzAuditWriter,
  shouldPersistAuthzRecord,
  type AuthzAuditRecord
} from "./authz-audit.js";

function record(
  overrides: Partial<AuthzAuditRecord> = {}
): AuthzAuditRecord {
  return {
    timeMs: 1_790_000_000_000,
    decision: "deny",
    reason: "drc_session_inactive",
    action: "publish",
    topic: "thing/product/RC-1/drc/down",
    username: "backend-service",
    clientId: "fh-clone-backend",
    gatewaySn: "RC-1",
    cacheHit: false,
    latencyUs: 500,
    ...overrides
  };
}

test("persists all deny and ignore decisions", () => {
  assert.equal(shouldPersistAuthzRecord(record()), true);
  assert.equal(
    shouldPersistAuthzRecord(record({ decision: "ignore", reason: "no_match" })),
    true
  );
});

test("persists allow only for control-sensitive topics", () => {
  assert.equal(
    shouldPersistAuthzRecord(
      record({
        decision: "allow",
        reason: "gateway_own_topic",
        topic: "thing/product/M3E-1/osd"
      })
    ),
    false
  );
  assert.equal(
    shouldPersistAuthzRecord(
      record({
        decision: "allow",
        reason: "drc_backend_publish",
        topic: "thing/product/RC-1/drc/down"
      })
    ),
    true
  );
});

test("JSONL receives normal allows while DB batching filters them", async () => {
  const lines: string[] = [];
  const batches: AuthzAuditRecord[][] = [];
  const writer = new AuthzAuditWriter({
    flushIntervalMs: 60_000,
    writeJsonl: (line) => lines.push(line),
    writeBatch: async (records) => {
      batches.push(records);
    }
  });

  writer.enqueue(
    record({
      decision: "allow",
      reason: "gateway_own_topic",
      topic: "thing/product/M3E-1/osd"
    })
  );
  writer.enqueue(record());

  await writer.flush();
  await writer.shutdown();

  assert.equal(lines.length, 2);
  assert.equal(batches.length, 1);
  assert.equal(batches[0]?.length, 1);
  assert.equal(batches[0]?.[0]?.decision, "deny");
});

test("JSONL exposes latency, cache state and runtime DRC session id", async () => {
  const lines: string[] = [];
  const writer = new AuthzAuditWriter({
    writeJsonl: (line) => lines.push(line)
  });

  writer.enqueue(
    record({
      drcSessionId: "9bb317e5-cf5c-4a95-8dc9-c919221e0310",
      latencyUs: 1234
    })
  );
  await writer.shutdown();

  const payload = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
  assert.equal(payload.cache_hit, false);
  assert.equal(payload.latency_us, 1234);
  assert.equal(
    payload.drc_session_id,
    "9bb317e5-cf5c-4a95-8dc9-c919221e0310"
  );
});

test("bounded buffer drops the oldest DB record without blocking enqueue", async () => {
  const batches: AuthzAuditRecord[][] = [];
  const writer = new AuthzAuditWriter({
    capacity: 2,
    batchSize: 100,
    flushIntervalMs: 60_000,
    writeJsonl: () => undefined,
    writeBatch: async (records) => {
      batches.push(records);
    }
  });

  writer.enqueue(record({ topic: "thing/product/RC-1/drc/down" }));
  writer.enqueue(record({ topic: "thing/product/RC-2/drc/down" }));
  writer.enqueue(record({ topic: "thing/product/RC-3/drc/down" }));

  assert.equal(writer.status.pending, 2);
  assert.equal(writer.status.droppedFromDatabaseBuffer, 1);

  await writer.shutdown();
  assert.deepEqual(
    batches.flat().map((entry) => entry.topic),
    [
      "thing/product/RC-2/drc/down",
      "thing/product/RC-3/drc/down"
    ]
  );
});

test("failed batch is restored in FIFO order and shutdown retries it", async () => {
  const written: AuthzAuditRecord[] = [];
  let attempts = 0;
  const writer = new AuthzAuditWriter({
    capacity: 4,
    batchSize: 10,
    flushIntervalMs: 60_000,
    shutdownFlushAttempts: 2,
    shutdownRetryDelayMs: 0,
    writeJsonl: () => undefined,
    writeBatch: async (records) => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient database failure");
      written.push(...records);
    }
  });

  writer.enqueue(record({ topic: "thing/product/RC-1/drc/down" }));
  writer.enqueue(record({ topic: "thing/product/RC-2/drc/down" }));

  await assert.rejects(writer.flush(), /transient database failure/);
  assert.equal(writer.status.pending, 2);

  writer.enqueue(record({ topic: "thing/product/RC-3/drc/down" }));
  await writer.shutdown();

  assert.equal(attempts, 2);
  assert.deepEqual(
    written.map((entry) => entry.topic),
    [
      "thing/product/RC-1/drc/down",
      "thing/product/RC-2/drc/down",
      "thing/product/RC-3/drc/down"
    ]
  );
  assert.equal(writer.status.pending, 0);
});

test("shutdown never reports success when retained audit records cannot flush", async () => {
  let attempts = 0;
  const writer = new AuthzAuditWriter({
    batchSize: 10,
    flushIntervalMs: 60_000,
    shutdownFlushAttempts: 2,
    shutdownRetryDelayMs: 0,
    writeJsonl: () => undefined,
    writeBatch: async () => {
      attempts += 1;
      throw new Error("database unavailable");
    }
  });

  writer.enqueue(record());

  await assert.rejects(
    writer.shutdown(),
    /AuthZ audit shutdown flush failed after 2 attempt\(s\)/
  );
  assert.equal(attempts, 2);
  assert.equal(writer.status.pending, 1);
});
