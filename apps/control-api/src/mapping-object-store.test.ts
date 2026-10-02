import assert from "node:assert/strict";
import test from "node:test";

import {
  MappingObjectStore,
  buildManagedMediaObjectKey,
  createMappingObjectStoreFromEnv,
  isManagedMediaObjectKeyForAsset,
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
    seen = {
      url: String(input),
      ...(init?.method ? { method: init.method } : {})
    };
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


test("managed media object keys are deterministic and hide source identifiers", () => {
  const key = buildManagedMediaObjectKey(
    "DJI-M3M-SERIAL-EXAMPLE:capture-17",
    "DJI_20261002_160000_0001.TIF"
  );

  assert.match(key, /^ingest\/[0-9a-f]{2}\/[0-9a-f]{64}\.tif$/);
  assert.ok(!key.includes("DJI-M3M-SERIAL-EXAMPLE"));
  assert.ok(!key.includes("DJI_20261002"));

  assert.equal(
    isManagedMediaObjectKeyForAsset(
      key,
      "DJI-M3M-SERIAL-EXAMPLE:capture-17",
      "DJI_20261002_160000_0001.TIF"
    ),
    true
  );
  assert.equal(
    isManagedMediaObjectKeyForAsset(
      key,
      "different-asset",
      "DJI_20261002_160000_0001.TIF"
    ),
    false
  );
});

test("managed media object keys reject path-like filenames", () => {
  for (const fileName of [
    "../DJI_0001.TIF",
    "folder/DJI_0001.TIF",
    "folder\\DJI_0001.TIF"
  ]) {
    assert.throws(
      () => buildManagedMediaObjectKey("asset-1", fileName),
      /media_upload_fileName_invalid/
    );
  }
});

test("presigned media PUT uses the media bucket", () => {
  const key = buildManagedMediaObjectKey("asset-1", "capture.JPG");
  const url = new URL(store().presignMediaPut(key));

  assert.equal(url.origin, "http://192.0.2.10:9000");
  assert.equal(url.pathname, `/fh2-media/${key}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
});

test("mediaExists checks the media bucket through the internal endpoint", async () => {
  let seen: { url: string; method?: string } | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    seen = {
      url: String(input),
      ...(init?.method ? { method: init.method } : {})
    };
    return new Response(null, { status: 200 });
  };

  const key = buildManagedMediaObjectKey("asset-1", "capture.JPG");
  assert.equal(await store(fetchImpl).mediaExists(key), true);
  assert.equal(seen?.method, "HEAD");
  assert.equal(new URL(seen!.url).hostname, "minio");
  assert.ok(new URL(seen!.url).pathname.startsWith("/fh2-media/ingest/"));
});


test("SigV4 canonical query sorts encoded parameter names bytewise", async () => {
  let seenUrl: string | undefined;
  const fetchImpl: typeof fetch = async (input) => {
    seenUrl = String(input);
    return new Response(
      "<?xml version=\"1.0\"?><ListBucketResult><KeyCount>0</KeyCount></ListBucketResult>",
      { status: 200 }
    );
  };

  assert.equal(await store(fetchImpl).ping(), true);
  assert.ok(seenUrl);

  const query = seenUrl!.split("?", 2)[1] ?? "";
  const algorithm = query.indexOf("X-Amz-Algorithm=");
  const signedHeaders = query.indexOf("X-Amz-SignedHeaders=");
  const listType = query.indexOf("list-type=");
  const maxKeys = query.indexOf("max-keys=");

  assert.ok(algorithm >= 0);
  assert.ok(signedHeaders > algorithm);
  assert.ok(listType > signedHeaders);
  assert.ok(maxKeys > listType);
});
