import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMappingAgentClaimInput,
  parseMappingAgentHeartbeatInput,
  parseMappingJobCreateInput
} from "./mapping-model.js";

test("mapping job parser normalizes the default profile", () => {
  assert.deepEqual(
    parseMappingJobCreateInput({
      name: "Halle Nord",
      assetIds: ["a-1", "a-2"]
    }),
    {
      name: "Halle Nord",
      assetIds: ["a-1", "a-2"],
      profile: "standard"
    }
  );
});

test("mapping job parser rejects duplicate media assets", () => {
  assert.throws(
    () =>
      parseMappingJobCreateInput({
        name: "duplicate",
        assetIds: ["a-1", "a-1"]
      }),
    /assetIds_must_be_unique/
  );
});

test("mapping options remain scalar and bounded", () => {
  assert.deepEqual(
    parseMappingJobCreateInput({
      name: "Orthofoto",
      assetIds: ["a-1"],
      profile: "high",
      odmOptions: {
        "feature-quality": "high",
        "pc-quality": "medium",
        dsm: true
      }
    }).odmOptions,
    {
      "feature-quality": "high",
      "pc-quality": "medium",
      dsm: true
    }
  );

  assert.throws(
    () =>
      parseMappingJobCreateInput({
        name: "bad",
        assetIds: ["a-1"],
        odmOptions: { nested: { forbidden: true } }
      }),
    /odmOptions_values_must_be_scalar/
  );
});

test("agent claim parser validates identity and lease", () => {
  assert.deepEqual(
    parseMappingAgentClaimInput({
      agentId: "x64-werkstatt",
      leaseSeconds: 600,
      capabilities: { ramGb: 64, gpu: "RTX" }
    }),
    {
      agentId: "x64-werkstatt",
      leaseSeconds: 600,
      capabilities: { ramGb: 64, gpu: "RTX" }
    }
  );

  assert.throws(
    () => parseMappingAgentClaimInput({ agentId: "../agent" }),
    /invalid_agentId/
  );
});

test("heartbeat parser bounds progress", () => {
  assert.deepEqual(
    parseMappingAgentHeartbeatInput({
      agentId: "agent-1",
      progress: 42.5,
      message: "matching"
    }),
    {
      agentId: "agent-1",
      progress: 42.5,
      message: "matching"
    }
  );

  assert.throws(
    () =>
      parseMappingAgentHeartbeatInput({
        agentId: "agent-1",
        progress: 101
      }),
    /progress_must_be_0_to_100/
  );
});
