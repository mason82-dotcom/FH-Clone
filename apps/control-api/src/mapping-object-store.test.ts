import assert from "node:assert/strict";
import test from "node:test";

import {
  MappingObjectStore,
  createMappingObjectStoreFromEnv,
  validateMappingResultPath
} from "./mapping-object-store.js";

function store(fetchImpl: typeof fetch = fetch) {
  return new MappingObjectStore({
    internalEndpoint: "http://minio:9000",
    publicEndpoint: "http://192.0.2.10:9000",
    accessKey: "mapping-user",
    secretKey: "top-secret-value",
    mediaBucket: "fh2-media",
    resultsBucket: "mapping-results",
    region: "us-east-1",
    presignTtlSeconds: 900,
    fetchImpl,
    now: () => new Date("2026-10-02T16:00:00.000Z")
  });
}

test("presigned media GET uses public endpoint and never exposes the secret", () => {
  const url = new URL(store().presignMediaGet("m3m/DJI 001.TIF"));
  assert.equal(url.origin, "http://192.0.2.10:9000");
  assert.equal(url.pathname, "/fh2-media/m3m/DJI%20001.TIF");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.match(url.searchParams.get("X-Amz-Credential") ?? "", /^mapping-user\//);
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
  assert.ok(!url.toString().includes("top-secret-value"));
});

test("presigned result PUT is restricted below the job prefix", () => {
  const url = new URL(
    store().presignResultPut(
      "11111111-1111-4111-8111-111111111111",
      "tiles/18/137412/89512.png"
    )
  );
  assert.equal(
    url.pathname,
    "/mapping-results/11111111-1111-4111-8111-111111111111/tiles/18/137412/89512.png"
  );
});

test("result path rejects traversal and ambiguous segments", () => {
  for (const path of [
    "../secret",
    "tiles/../secret",
    "/absolute",
    "tiles//1.png",
    "tiles\\1.png"
  ]) {
    assert.throws(() => validateMappingResultPath(path), /mapping_result_path_invalid/);
  }
  assert.equal(
    validateMappingResultPath("tiles/18/137412/89512.png"),
    "tiles/18/137412/89512.png"
  );
});

test("storage configuration is all-or-nothing", () => {
  assert.equal(createMappingObjectStoreFromEnv({}), undefined);
  assert.throws(
    () =>
      createMappingObjectStoreFromEnv({
        MAPPING_S3_INTERNAL_ENDPOINT: "http://minio:9000"
      }),
    /mapping_object_store_incomplete/
  );
});

test("resultExists uses an internally signed HEAD request", async () => {
  let seen: { url: string; method?: string } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    seen = { url: String(input), method: init?.method };
    return new Response(null, { status: 200 });
  };
  const exists = await store(fetchImpl).resultExists(
    "11111111-1111-4111-8111-111111111111",
    "orthophoto.tif"
  );
  assert.equal(exists, true);
  assert.equal(seen?.method, "HEAD");
  assert.equal(new URL(seen!.url).hostname, "minio");
});
