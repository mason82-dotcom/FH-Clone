import assert from "node:assert/strict";
import test from "node:test";

import { PilotWaylineServer } from "./pilot-wayline-server.js";

const workspaceId = "e3dea0f5-37f2-4d79-ae58-490af3228069";

test("Pilot Wayline server is fail-closed until enabled with UUID and token", () => {
  assert.deepEqual(
    new PilotWaylineServer({ enabled: false }).status(),
    {
      enabled: false,
      configured: false,
      readOnly: true,
      workspaceConfigured: false,
      authConfigured: false,
      listRequests: 0
    }
  );

  assert.equal(
    new PilotWaylineServer({
      enabled: true,
      workspaceId: "not-a-uuid",
      authToken: "secret"
    }).configured,
    false
  );
});

test("matches only the DJI Pilot Wayline list route and exact workspace", () => {
  const server = configured();

  assert.equal(
    server.matchWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines`
    ),
    workspaceId
  );
  assert.equal(
    server.matchWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines/download`
    ),
    undefined
  );
  assert.equal(server.workspaceMatches(workspaceId), true);
  assert.equal(
    server.workspaceMatches("11111111-1111-4111-8111-111111111111"),
    false
  );
});

test("validates x-auth-token with an exact token match", () => {
  const server = configured();

  assert.equal(server.authenticate({ "x-auth-token": "server-secret" }), true);
  assert.equal(server.authenticate({ "x-auth-token": "wrong" }), false);
  assert.equal(server.authenticate({}), false);
});

test("returns the DJI list envelope with an intentionally empty read-only catalog", () => {
  const server = configured();
  const result = server.list(
    new URL(
      `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines?page=2&page_size=25`
    )
  );

  assert.deepEqual(result, {
    code: 0,
    message: "success",
    data: {
      list: [],
      pagination: {
        page: 2,
        page_size: 25,
        total: 0
      }
    }
  });
});

test("records only non-sensitive runtime observation for successful list requests", () => {
  const server = configured();
  const url = new URL(
    `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines`
  );

  server.list(url, Date.parse("2026-09-30T18:00:00.000Z"));

  assert.deepEqual(server.status(), {
    enabled: true,
    configured: true,
    readOnly: true,
    workspaceConfigured: true,
    authConfigured: true,
    listRequests: 1,
    lastListRequestAt: "2026-09-30T18:00:00.000Z"
  });
});

test("records only a boolean/count observation for DJI Pilot WebView requests", () => {
  const server = configured();
  const url = new URL(
    `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines?page=1&page_size=10`
  );

  server.list(
    url,
    Date.parse("2026-09-30T19:30:00.000Z"),
    {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; DJI RC Pro Enterprise; wv) dji-open-platform"
    }
  );

  assert.deepEqual(server.status(), {
    enabled: true,
    configured: true,
    readOnly: true,
    workspaceConfigured: true,
    authConfigured: true,
    listRequests: 1,
    lastListRequestAt: "2026-09-30T19:30:00.000Z",
    pilotWebViewListRequests: 1,
    lastPilotWebViewListRequestAt: "2026-09-30T19:30:00.000Z"
  });

  assert.equal(
    JSON.stringify(server.status()).includes("DJI RC Pro Enterprise"),
    false
  );
});

test("rejects malformed pagination instead of partially parsing it", () => {
  const server = configured();

  for (const query of ["page=2x", "page=0", "page_size=25.5", "page_size=501"]) {
    assert.throws(
      () =>
        server.list(
          new URL(
            `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines?${query}`
          )
        ),
      /invalid_query_/
    );
  }
});

function configured(): PilotWaylineServer {
  return new PilotWaylineServer({
    enabled: true,
    workspaceId,
    authToken: "server-secret"
  });
}
