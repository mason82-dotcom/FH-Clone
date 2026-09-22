import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeControlGuardRegistry } from "./control-guards.js";

test("FC3 is runtime-only and explicit", () => {
  const guards = new RuntimeControlGuardRegistry();
  assert.equal(guards.hasFc3("M4T-001"), false);
  guards.setFc3("M4T-001", true);
  assert.equal(guards.hasFc3("M4T-001"), true);
  guards.setFc3("M4T-001", false);
  assert.equal(guards.hasFc3("M4T-001"), false);
});

test("lease is exclusive and expires fail-closed", () => {
  let now = 1000;
  const guards = new RuntimeControlGuardRegistry(() => now);
  guards.acquireLease("M4T-001", "operator-a", 1000);
  assert.equal(guards.hasLease("M4T-001", "operator-a"), true);
  assert.throws(() => guards.acquireLease("M4T-001", "operator-b", 1000), /already held/);
  now = 2000;
  assert.equal(guards.hasLease("M4T-001"), false);
  guards.acquireLease("M4T-001", "operator-b", 1000);
  assert.equal(guards.hasLease("M4T-001", "operator-b"), true);
});
