import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMappingAgentClaimInput,
  parseMappingAgentHeartbeatInput,
  parseMappingCompleteInput,
  parseMappingJobCreateInput,
  parseMappingUploadUrlsInput
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


test("agent payloads accept the AeroNexus snake_case aliases", () => {
  assert.deepEqual(
    parseMappingAgentClaimInput({
      agent_id: "x64-node",
      lease_seconds: 300,
      capabilities: { gpu: true }
    }),
    {
      agentId: "x64-node",
      leaseSeconds: 300,
      capabilities: { gpu: true }
    }
  );

  assert.deepEqual(
    parseMappingAgentHeartbeatInput({
      agent_id: "x64-node",
      lease_seconds: 300,
      progress: 12.5
    }),
    {
      agentId: "x64-node",
      leaseSeconds: 300,
      progress: 12.5
    }
  );
});

test("upload URL parser rejects traversal and duplicates", () => {
  assert.deepEqual(
    parseMappingUploadUrlsInput({
      agent_id: "agent-1",
      paths: ["orthophoto.tif", "tiles/18/1/2.png"]
    }),
    {
      agentId: "agent-1",
      paths: ["orthophoto.tif", "tiles/18/1/2.png"]
    }
  );

  assert.throws(
    () =>
      parseMappingUploadUrlsInput({
        agent_id: "agent-1",
        paths: ["../secret"]
      }),
    /mapping_result_path_invalid/
  );
});

test("complete parser validates result manifest and tile bounds", () => {
  assert.deepEqual(
    parseMappingCompleteInput({
      agent_id: "agent-1",
      manifest: {
        crs: "EPSG:25832",
        bounds_wgs84: [8.5, 49.1, 8.6, 49.2],
        files: [
          {
            path: "orthophoto.tif",
            kind: "orthophoto_cog",
            sha256: "a".repeat(64),
            size: 1234
          }
        ],
        tiles: {
          path: "tiles",
          format: "png",
          minzoom: 14,
          maxzoom: 20
        }
      }
    }),
    {
      agentId: "agent-1",
      manifest: {
        crs: "EPSG:25832",
        boundsWgs84: [8.5, 49.1, 8.6, 49.2],
        files: [
          {
            path: "orthophoto.tif",
            kind: "orthophoto_cog",
            sha256: "a".repeat(64),
            size: 1234
          }
        ],
        tiles: {
          path: "tiles",
          format: "png",
          minzoom: 14,
          maxzoom: 20
        }
      }
    }
  );

  assert.throws(
    () =>
      parseMappingCompleteInput({
        agent_id: "agent-1",
        manifest: {
          files: [{ path: "orthophoto.tif", kind: "orthophoto_cog" }],
          bounds_wgs84: [8.6, 49.1, 8.5, 49.2]
        }
      }),
    /manifest_bounds_invalid/
  );
});
