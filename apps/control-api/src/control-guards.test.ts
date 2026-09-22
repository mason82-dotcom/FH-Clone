import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeControlGuardRegistry, resolveRuntimeDrcGuards } from "./control-guards.js";

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

test("DRC guard resolution requires all four runtime sources", () => {
  const runtime = new RuntimeControlGuardRegistry();
  runtime.setFc3("M4T-001", true);
  runtime.acquireLease("M4T-001", "operator-a", 1000);

  const guards = resolveRuntimeDrcGuards({
    hasFc3: (sn) => runtime.hasFc3(sn),
    hasLease: (sn, holder) => runtime.hasLease(sn, holder),
    supportsFlightControl: () => true,
    isCloudControlAuthorized: () => false
  }, "M4T-001", "operator-a");

  assert.deepEqual(guards, {
    fc3: true,
    controlLease: true,
    capability: true,
    djiAuthority: false
  });
});
