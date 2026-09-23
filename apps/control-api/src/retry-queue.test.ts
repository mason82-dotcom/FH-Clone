import assert from "node:assert/strict";
import test from "node:test";

import { RetryQueue } from "./retry-queue.js";

test("retains failed work and drains it after recovery", async () => {
  let available = false;
  const persisted: number[] = [];
  const queue = new RetryQueue<number>({
    retryIntervalMs: 60_000,
    process: async (value) => {
      if (!available) throw new Error("db_down");
      persisted.push(value);
    }
  });

  queue.enqueue(1);
  queue.enqueue(2);
  await assert.rejects(queue.flush(), /db_down/);
  assert.equal(queue.status.pending, 2);
  assert.equal(queue.status.healthy, false);

  available = true;
  await queue.flush();
  assert.deepEqual(persisted, [1, 2]);
  assert.deepEqual(queue.status, {
    pending: 0,
    dropped: 0,
    healthy: true
  });
  await queue.shutdown();
});

test("drop-oldest bounds high-volume queues explicitly", async () => {
  let available = false;
  const persisted: number[] = [];
  const dropped: number[] = [];
  const queue = new RetryQueue<number>({
    capacity: 2,
    retryIntervalMs: 60_000,
    dropPolicy: "drop-oldest",
    onDrop: (value) => dropped.push(value),
    process: async (value) => {
      if (!available) throw new Error("db_down");
      persisted.push(value);
    }
  });

  queue.enqueue(1);
  await assert.rejects(queue.flush(), /db_down/);
  queue.enqueue(2);
  queue.enqueue(3);

  assert.deepEqual(dropped, [1]);
  assert.equal(queue.status.dropped, 1);

  available = true;
  await queue.flush();
  assert.deepEqual(persisted, [2, 3]);
  await queue.shutdown();
});

test("reject-new never silently drops mission-style work", async () => {
  const queue = new RetryQueue<number>({
    capacity: 1,
    retryIntervalMs: 60_000,
    process: async () => {
      throw new Error("db_down");
    }
  });

  queue.enqueue(1);
  await assert.rejects(queue.flush(), /db_down/);
  assert.throws(() => queue.enqueue(2), /retry_queue_capacity_exceeded/);
  await assert.rejects(queue.shutdown(), /db_down/);
});
