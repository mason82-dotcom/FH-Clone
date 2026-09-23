import assert from "node:assert/strict";
import test from "node:test";

import {
  DjiPilotWaylineCatalogClient,
  DjiPilotWaylineCatalogError,
  DjiPilotWaylineCatalogNotConfigured,
  toPilotWaylineMissionReference,
  type DjiPilotFetch
} from "./wpml/pilot-waylines.js";

test("lists DJI Pilot waypoint files read-only and keeps model keys separate from payload_index", async () => {
  let seenUrl: URL | undefined;
  let seenInit: RequestInit | undefined;

  const fetchImpl: DjiPilotFetch = async (input, init) => {
    seenUrl = new URL(String(input));
    seenInit = init;
    return new Response(
      JSON.stringify({
        code: 0,
        message: "success",
        data: {
          list: [
            {
              id: "wl-1",
              drone_model_key: "0-67-0",
              favorited: false,
              name: "M3M Survey",
              payload_model_keys: ["1-68-0"],
              template_types: [0],
              action_type: 0,
              update_time: 1637158501230,
              user_name: "pilot",
              start_wayline_point: {
                start_latitude: 49.218,
                start_lontitude: 8.588
              }
            }
          ],
          pagination: { page: 2, page_size: 25, total: 1 }
        }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const client = new DjiPilotWaylineCatalogClient({
    enabled: true,
    baseUrl: "https://pilot.example",
    workspaceId: "workspace-1",
    authToken: "secret-token",
    fetchImpl
  });

  const result = await client.listWaylines({
    key: "M3M Survey",
    page: 2,
    pageSize: 25,
    favorited: false,
    orderBy: "update_time desc",
    actionType: 1,
    templateTypes: [0, 2],
    droneModelKeys: ["0-67-0", "0-77-2"],
    payloadModelKeys: ["1-68-0"]
  });

  assert.equal(seenInit?.method, "GET");
  assert.equal(seenInit?.redirect, "manual");
  assert.equal((seenInit?.headers as Record<string, string>)["x-auth-token"], "secret-token");
  assert.equal(seenUrl?.pathname, "/wayline/api/v1/workspaces/workspace-1/waylines");
  assert.equal(seenUrl?.searchParams.get("key"), "M3M Survey");
  assert.equal(seenUrl?.searchParams.get("order_by"), "update_time desc");
  assert.equal(seenUrl?.searchParams.get("action_type"), "1");
  assert.deepEqual(seenUrl?.searchParams.getAll("template_type"), ["0", "2"]);
  assert.deepEqual(seenUrl?.searchParams.getAll("drone_model_keys"), ["0-67-0", "0-77-2"]);
  assert.deepEqual(seenUrl?.searchParams.getAll("payload_model_key"), ["1-68-0"]);

  assert.deepEqual(result.items[0], {
    id: "wl-1",
    name: "M3M Survey",
    droneModelKey: "0-67-0",
    payloadModelKeys: ["1-68-0"],
    templateTypes: [0],
    actionType: 0,
    favorited: false,
    updateTimeMs: 1637158501230,
    userName: "pilot",
    startPoint: { latitude: 49.218, longitude: 8.588 }
  });
  assert.deepEqual(result.pagination, { page: 2, pageSize: 25, total: 1 });
});

test("accepts a corrected longitude spelling without depending on it", async () => {
  const client = configured(async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: {
          list: [
            {
              start_wayline_point: {
                start_latitude: 1.25,
                start_longitude: 2.5
              }
            }
          ],
          pagination: {}
        }
      }),
      { status: 200 }
    )
  );

  const result = await client.listWaylines();
  assert.deepEqual(result.items[0]?.startPoint, { latitude: 1.25, longitude: 2.5 });
});

test("rejects DJI business errors and redirects", async () => {
  await assert.rejects(
    () =>
      configured(async () =>
        new Response(JSON.stringify({ code: 123, message: "denied" }), { status: 200 })
      ).listWaylines(),
    (error: unknown) =>
      error instanceof DjiPilotWaylineCatalogError && error.message === "denied"
  );

  await assert.rejects(
    () =>
      configured(async () =>
        new Response(null, { status: 302, headers: { location: "/login" } })
      ).listWaylines(),
    /HTTP 302/
  );
});

test("fails closed when the Pilot catalog is not configured", async () => {
  const client = new DjiPilotWaylineCatalogClient({ enabled: false });
  assert.equal(client.status().readOnly, true);
  await assert.rejects(
    () => client.listWaylines(),
    (error: unknown) => error instanceof DjiPilotWaylineCatalogNotConfigured
  );
});

function configured(fetchImpl: DjiPilotFetch): DjiPilotWaylineCatalogClient {
  return new DjiPilotWaylineCatalogClient({
    enabled: true,
    baseUrl: "https://pilot.example",
    workspaceId: "workspace-1",
    authToken: "token",
    fetchImpl
  });
}

test("maps a real Pilot waypoint-file id to an authoritative mission reference", () => {
  assert.deepEqual(
    toPilotWaylineMissionReference({
      id: "wl-123",
      name: "Survey",
      payloadModelKeys: [],
      templateTypes: []
    }),
    {
      kind: "wayline",
      id: "wl-123",
      source: "dji_pilot_wayline",
      confidence: "authoritative"
    }
  );

  assert.equal(
    toPilotWaylineMissionReference({
      payloadModelKeys: [],
      templateTypes: []
    }),
    undefined
  );
});

