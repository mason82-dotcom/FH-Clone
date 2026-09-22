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
  assert.equal(batches.flat().length, 2);
});
