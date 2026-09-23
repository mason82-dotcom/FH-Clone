import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(
  new URL("../../../compose.yaml", import.meta.url),
  "utf8"
);

function serviceBlock(name: string): string {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `service ${name} missing`);

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^  [a-zA-Z0-9_-]+:$/.test(line)) break;
    block.push(line);
  }

  return block.join("\n");
}

test("control-api waits for TimescaleDB and EMQX health", () => {
  const controlApi = serviceBlock("control-api");

  assert.match(
    controlApi,
    /timescaledb:\s*\n\s*condition:\s*service_healthy/
  );
  assert.match(
    controlApi,
    /emqx:\s*\n\s*condition:\s*service_healthy/
  );
});

test("internal control-api port 8081 is not published to the host", () => {
  const controlApi = serviceBlock("control-api");
  const portsMatch = controlApi.match(/\n\s+ports:\n([\s\S]*?)(?=\n\s{4}\S|$)/);
  const ports = portsMatch?.[1] ?? "";

  assert.doesNotMatch(ports, /8081/);
  assert.match(controlApi, /expose:\s*\n\s*-\s*"8081"/);
});

test("EMQX hooks use the internal control-api port", () => {
  const emqx = serviceBlock("emqx");

  assert.match(
    emqx,
    /http:\/\/control-api:8081\/internal\/emqx\/authn/
  );
  assert.match(
    emqx,
    /http:\/\/control-api:8081\/internal\/emqx\/authz/
  );
});

test("backend network remains internal", () => {
  assert.match(
    compose,
    /\n  backend:\s*\n\s+internal:\s*true/
  );
});
