import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(
    new URL(`../../../${path}`, import.meta.url),
    "utf8"
  );
}

function sqlWithoutComments(value: string): string {
  return value
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const gatewayCredentials = read(
  "infra/timescale/sql/004_gateway_credentials.sql"
);
const topology = read(
  "infra/postgres/migrations/001_dji_gateway_registry.sql"
);
const authzAudit = read(
  "infra/timescale/sql/003_authz_audit.sql"
);
const controlApi = read(
  "apps/control-api/src/index.ts"
);

test("gateway credential persistence contains identity only, never runtime control rights", () => {
  assert.match(gatewayCredentials, /CREATE TABLE IF NOT EXISTS gateway_credentials/);
  assert.match(gatewayCredentials, /password_hash/);
  assert.match(gatewayCredentials, /gateway_sn/);

  assert.doesNotMatch(
    sqlWithoutComments(gatewayCredentials),
    /fc_stage|control_lease|cloud_control_auth|flight_authority|drc_state|drc_session/i
  );
});

test("persisted topology cannot become a runtime control-authority store", () => {
  assert.match(topology, /CREATE TABLE IF NOT EXISTS dji_gateways/);
  assert.match(topology, /CREATE TABLE IF NOT EXISTS dji_gateway_devices/);

  assert.doesNotMatch(
    sqlWithoutComments(topology),
    /device_secret|nonce|fc_stage|control_lease|cloud_control_auth|flight_authority|drc_state|drc_session/i
  );
});

test("authorization audit may reference a DRC session id but remains a sink only", () => {
  assert.match(authzAudit, /drc_session_id/);
  assert.match(
    authzAudit,
    /MUST NOT be queried by the\s+-- runtime authorizer to reconstruct gateway topology or DRC session state/
  );
  assert.doesNotMatch(
    authzAudit,
    /CREATE TABLE IF NOT EXISTS\s+(drc_sessions|control_leases|runtime_authority)/i
  );
});

test("control-api uses an in-memory DRC session store and never rehydrates one from PostgreSQL", () => {
  assert.match(controlApi, /new InMemoryDrcSessionStore\(\)/);
  assert.doesNotMatch(
    controlApi,
    /PostgresDrcSessionStore|recoverDrc|rehydrateDrc/i
  );
});
