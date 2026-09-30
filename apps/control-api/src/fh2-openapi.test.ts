import assert from "node:assert/strict";
import test from "node:test";

import {
  Fh2OpenApiClient,
  Fh2OpenApiError,
  type Fh2Fetch
} from "./fh2-openapi.js";
import type {
  Fh2FlightTask,
  Fh2HmsAlert,
  Fh2ListResult,
  Fh2ManageDevice,
  Fh2PaginatedList,
  Fh2WaylineItem
} from "./fh2-openapi-types.js";

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

function page(page: number, pageSize: number, total = 0) {
  return {
    page,
    page_size: pageSize,
    total
  };
}

test("lists Waylines read-only with a typed FH2 V2 result", async () => {
  let seenUrl: URL | undefined;
  let seenInit: RequestInit | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenInit = init;
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          pagination: page(2, 25),
          list: [{ id: "wayline-1", name: "Survey A" }]
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const result = await client(fetchImpl).listWaylines(2, 25);
  const typed: Fh2PaginatedList<Fh2WaylineItem> = result;

  assert.equal(typed.list[0]?.id, "wayline-1");
  assert.equal(typed.pagination.page, 2);
  assert.equal(
    seenUrl?.pathname,
    "/openapi/v2.0/wayline/api/v1/workspaces/project-1/web-waylines"
  );
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

test("lists Flight Tasks with a typed page and never uses a write method", async () => {
  let seenUrl: URL | undefined;
  let seenMethod: string | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenMethod = init?.method;
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          pagination: page(3, 40, 1),
          list: [{ flight_task_id: "task-1", task_name: "Inspection" }]
        }
      }),
      { status: 200 }
    );
  };

  const result = await client(fetchImpl).listFlightTasks(3, 40);
  const typed: Fh2PaginatedList<Fh2FlightTask> = result;

  assert.equal(typed.list[0]?.flight_task_id, "task-1");
  assert.equal(typed.pagination.total, 1);
  assert.equal(
    seenUrl?.pathname,
    "/openapi/v2.0/task/api/v2/workspaces/project-1/flight-tasks"
  );
  assert.equal(seenUrl?.searchParams.get("page"), "3");
  assert.equal(seenUrl?.searchParams.get("page_size"), "40");
  assert.equal(seenMethod, "GET");
});

test("rejects redirects instead of treating them as FH2 success", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(null, { status: 302, headers: { location: "/login" } });

  await assert.rejects(
    () => client(fetchImpl).listWaylines(),
    (error: unknown) =>
      error instanceof Fh2OpenApiError && /HTTP 302/.test(error.message)
  );
});

test("rejects non-zero FH2 business codes", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(JSON.stringify({ code: 1001, message: "denied" }), {
      status: 200
    });

  await assert.rejects(
    () => client(fetchImpl).listFlightTasks(),
    (error: unknown) =>
      error instanceof Fh2OpenApiError && error.message === "denied"
  );
});

test("lists devices as typed resources and expands airport classes", async () => {
  let seenUrl: URL | undefined;
  let seenMethod: string | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenMethod = init?.method;
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          pagination: page(2, 25, 1),
          list: [
            {
              device_sn: "dock-1",
              device_callsign: "Dock One",
              device_model: {
                key: "3-3-0",
                name: "Dock 3",
                class: "airport"
              }
            }
          ]
        }
      }),
      { status: 200 }
    );
  };

  const result = await client(fetchImpl).listDevices("airport", 2, 25);
  const typed: Fh2PaginatedList<Fh2ManageDevice> = result;

  assert.equal(typed.list[0]?.device_sn, "dock-1");
  assert.equal(typed.list[0]?.device_model?.class, "airport");
  assert.equal(
    seenUrl?.pathname,
    "/openapi/v2.0/manage/api/v1/organizations/org-1/manage-devices"
  );
  assert.deepEqual(seenUrl?.searchParams.getAll("device_model_class"), [
    "airport",
    "base_station"
  ]);
  assert.equal(seenUrl?.searchParams.get("page"), "2");
  assert.equal(seenUrl?.searchParams.get("page_size"), "25");
  assert.equal(seenMethod, "GET");
});

test("lists typed HMS alerts with repeated device_sn and DJI parameters", async () => {
  let seenUrl: URL | undefined;
  let seenMethod: string | undefined;
  const fetchImpl: Fh2Fetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenMethod = init?.method;
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          list: [
            {
              device_sn: "aircraft-1",
              level: 2,
              code: "0x1234"
            }
          ]
        }
      }),
      { status: 200 }
    );
  };

  const result = await client(fetchImpl).listHms(
    ["aircraft-1", "aircraft-1", "gateway-1"],
    1_700_000_000_000,
    1_700_086_400_000,
    2,
    20
  );
  const typed: Fh2ListResult<Fh2HmsAlert> = result;

  assert.equal(typed.list[0]?.level, 2);
  assert.equal(
    seenUrl?.pathname,
    "/openapi/v2.0/manage/api/v1/organizations/org-1/manage-devices/hms"
  );
  assert.deepEqual(seenUrl?.searchParams.getAll("device_sn"), [
    "aircraft-1",
    "gateway-1"
  ]);
  assert.equal(seenUrl?.searchParams.get("begin_time"), "1700000000000");
  assert.equal(seenUrl?.searchParams.get("end_time"), "1700086400000");
  assert.equal(seenUrl?.searchParams.get("language"), "zh");
  assert.equal(seenUrl?.searchParams.get("page"), "2");
  assert.equal(seenUrl?.searchParams.get("page_size"), "20");
  assert.equal(seenMethod, "GET");
});

test("rejects a malformed paginated device response", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          list: [{ device_sn: "dock-1" }]
        }
      }),
      { status: 200 }
    );

  await assert.rejects(
    () => client(fetchImpl).listDevices(),
    (error: unknown) =>
      error instanceof Fh2OpenApiError &&
      error.message === "FH2 OpenAPI Devices returned invalid pagination"
  );
});

test("rejects a Wayline item without a stable id", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          pagination: page(1, 100, 1),
          list: [{ name: "Missing id" }]
        }
      }),
      { status: 200 }
    );

  await assert.rejects(
    () => client(fetchImpl).listWaylines(),
    (error: unknown) =>
      error instanceof Fh2OpenApiError &&
      error.message === "FH2 OpenAPI Waylines returned invalid item at index 0"
  );
});

test("rejects malformed optional HMS pagination", async () => {
  const fetchImpl: Fh2Fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          pagination: {
            page: 1,
            page_size: 20,
            total: "1"
          },
          list: [{ device_sn: "aircraft-1", level: 1 }]
        }
      }),
      { status: 200 }
    );

  await assert.rejects(
    () => client(fetchImpl).listHms(["aircraft-1"], 1, 2),
    (error: unknown) =>
      error instanceof Fh2OpenApiError &&
      error.message === "FH2 OpenAPI HMS returned invalid pagination"
  );
});

