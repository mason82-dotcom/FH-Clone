import assert from "node:assert/strict";
import test from "node:test";

import {
  isQualifiedNativePilotRequest,
  PilotWaylineServer
} from "./pilot-wayline-server.js";

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

test("matches only the supported DJI Pilot read-only Wayline routes", () => {
  const server = configured();

  assert.equal(
    server.matchWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines`
    ),
    workspaceId
  );
  assert.equal(
    server.matchDuplicateNamesWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines/duplicate-names`
    ),
    workspaceId
  );
  assert.equal(
    server.matchWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines/download`
    ),
    undefined
  );
  assert.equal(
    server.matchDuplicateNamesWorkspace(
      `/wayline/api/v1/workspaces/${workspaceId}/waylines/upload`
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
      `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines?file_type=5&key=&favorited=false&order_by=update_time%20desc&page_size=9&page=1`
    )
  );

  assert.deepEqual(result, {
    code: 0,
    message: "success",
    data: {
      list: [],
      pagination: {
        page: 1,
        page_size: 9,
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

test("qualifies the real native Pilot 2 okhttp signature fail-closed", () => {
  assert.equal(
    isQualifiedNativePilotRequest({ "user-agent": "okhttp/3.14.9" }),
    true
  );
  assert.equal(
    isQualifiedNativePilotRequest({
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; DJI RC Pro Enterprise; wv) dji-open-platform"
    }),
    false
  );
  assert.equal(
    isQualifiedNativePilotRequest({ "user-agent": "okhttp/4.12.0" }),
    false
  );
  assert.equal(isQualifiedNativePilotRequest({}), false);
});

test("records native Pilot list evidence without persisting the user-agent", () => {
  const server = configured();
  const url = new URL(
    `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines?file_type=5&key=&favorited=false&order_by=update_time%20desc&page_size=9&page=1`
  );

  server.list(
    url,
    Date.parse("2026-09-30T21:06:59.000Z"),
    { "user-agent": "okhttp/3.14.9" }
  );

  assert.deepEqual(server.status(), {
    enabled: true,
    configured: true,
    readOnly: true,
    workspaceConfigured: true,
    authConfigured: true,
    listRequests: 1,
    lastListRequestAt: "2026-09-30T21:06:59.000Z",
    pilotNativeListRequests: 1,
    lastPilotNativeListRequestAt: "2026-09-30T21:06:59.000Z"
  });

  assert.equal(
    JSON.stringify(server.status()).includes("okhttp"),
    false
  );
});

test("implements DJI duplicate-name lookup read-only for the empty catalog", () => {
  const server = configured();
  const result = server.duplicateNames(
    new URL(
      `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines/duplicate-names?name=NeuegeometrischeRoute1`
    ),
    Date.parse("2026-09-30T21:07:15.000Z")
  );

  assert.deepEqual(result, {
    code: 0,
    message: "success",
    data: []
  });
  assert.deepEqual(server.status(), {
    enabled: true,
    configured: true,
    readOnly: true,
    workspaceConfigured: true,
    authConfigured: true,
    listRequests: 0,
    duplicateNameRequests: 1,
    lastDuplicateNameRequestAt: "2026-09-30T21:07:15.000Z"
  });
});

test("duplicate-name lookup requires at least one non-empty name", () => {
  const server = configured();
  for (const query of ["", "name=", "name=%20"]) {
    assert.throws(
      () =>
        server.duplicateNames(
          new URL(
            `http://localhost/wayline/api/v1/workspaces/${workspaceId}/waylines/duplicate-names?${query}`
          )
        ),
      /invalid_query_name/
    );
  }
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
