import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/index.ts", import.meta.url),
  "utf8"
);

test("topology persistence queue is bounded drop-oldest", () => {
  const start = source.indexOf("function createTopologyPersistenceQueue");
  assert.notEqual(start, -1);

  const end = source.indexOf("\n  return {", start);
  assert.notEqual(end, -1);

  const block = source.slice(start, end);
  assert.match(block, /capacity:\s*1_000/);
  assert.match(block, /dropPolicy:\s*"drop-oldest"/);
  assert.match(block, /onDrop:/);
});
