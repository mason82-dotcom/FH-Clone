import assert from "node:assert/strict";
import test from "node:test";

import {
  Fh2OpenApiClient,
  Fh2OpenApiError,
  type Fh2Fetch
} from "./fh2-openapi.js";

function client(fetchImpl: Fh2Fetch) {
  return new Fh2OpenApiClient({
    enabled: true,
    baseUrl: "https://fh2.example",
    organizationId: "org-1",
    projectId: "project-1",
    userToken: "user-token",
    fetchImpl
  });
}

test("lists Waylines read-only with the FH2 V2 size parameter", async () => {
  let seenUrl: URL | undefined;
  let seenInit: RequestInit | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenInit = init;
    return new Response(JSON.stringify({ code: 0, data: { list: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await client(fetchImpl).listWaylines(2, 25);
  assert.deepEqual(result, { list: [] });
  assert.equal(seenUrl?.pathname, "/openapi/v2.0/wayline/api/v1/workspaces/project-1/web-waylines");
  assert.equal(seenUrl?.searchParams.get("page"), "2");
  assert.equal(seenUrl?.searchParams.get("size"), "25");
  assert.equal(seenInit?.method, "GET");
  assert.equal(seenInit?.redirect, "manual");
  const headers = seenInit?.headers as Record<string, string>;
  assert.equal(headers["X-User-Token"], "user-token");
  assert.equal(headers["X-Project-Uuid"], "project-1");
  assert.equal(headers["X-Language"], "en");
  assert.ok(headers["X-Request-Id"]);
});

test("lists Flight Tasks with page_size and never uses a write method", async () => {
  let seenUrl: URL | undefined;
  let seenMethod: string | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenMethod = init?.method;
    return new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 });
  };

  await client(fetchImpl).listFlightTasks(3, 40);
  assert.equal(seenUrl?.pathname, "/openapi/v2.0/task/api/v2/workspaces/project-1/flight-tasks");
  assert.equal(seenUrl?.searchParams.get("page"), "3");
  assert.equal(seenUrl?.searchParams.get("page_size"), "40");
  assert.equal(seenMethod, "GET");
});

test("rejects redirects instead of treating them as FH2 success", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(null, { status: 302, headers: { location: "/login" } });

  await assert.rejects(
    () => client(fetchImpl).listWaylines(),
    (error: unknown) => error instanceof Fh2OpenApiError && /HTTP 302/.test(error.message)
  );
});

test("rejects non-zero FH2 business codes", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(JSON.stringify({ code: 1001, message: "denied" }), { status: 200 });

  await assert.rejects(
    () => client(fetchImpl).listFlightTasks(),
    (error: unknown) => error instanceof Fh2OpenApiError && error.message === "denied"
  );
});

test("airport device listing sends both DJI model classes", async () => {
  let seenUrl: URL | undefined;
  const fetchImpl: Fh2Fetch = async (input) => {
    seenUrl = new URL(String(input));
    return new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 });
  };

  await client(fetchImpl).listDevices("airport", 1, 100);
  assert.deepEqual(seenUrl?.searchParams.getAll("device_model_class"), ["airport", "base_station"]);
});
