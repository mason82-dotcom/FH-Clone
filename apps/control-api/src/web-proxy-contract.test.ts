import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nginx = readFileSync(
  new URL("../../../infra/docker/web-nginx.conf", import.meta.url),
  "utf8"
);

test("web proxy exposes health and readiness through public control-api port", () => {
  assert.match(
    nginx,
    /location = \/health\s*\{[\s\S]*?proxy_pass http:\/\/control-api:8080\/health;/
  );
  assert.match(
    nginx,
    /location = \/ready\s*\{[\s\S]*?proxy_pass http:\/\/control-api:8080\/ready;/
  );
});

test("web proxy forwards /api without exposing the internal hook port", () => {
  assert.match(
    nginx,
    /location \/api\/\s*\{[\s\S]*?proxy_pass http:\/\/control-api:8080;/
  );
  assert.doesNotMatch(nginx, /control-api:8081/);
  assert.doesNotMatch(nginx, /internal\/emqx/);
});

test("SPA fallback is limited to the root location and cannot mask API routing", () => {
  assert.match(
    nginx,
    /location \/\s*\{\s*try_files \$uri \$uri\/ \/index\.html;\s*\}/
  );

  const apiIndex = nginx.indexOf("location /api/");
  const spaIndex = nginx.indexOf("location / {");
  assert.ok(apiIndex >= 0 && spaIndex >= 0);
  assert.ok(apiIndex < spaIndex);
});

test("browser proxy config contains no MQTT broker or credential material", () => {
  assert.doesNotMatch(nginx, /mqtt:\/\//i);
  assert.doesNotMatch(nginx, /EMQX_AUTHN_TOKEN|EMQX_AUTHZ_TOKEN|MQTT_BACKEND_PASSWORD/);
});
