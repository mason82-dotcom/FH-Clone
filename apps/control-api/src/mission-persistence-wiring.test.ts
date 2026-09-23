import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/index.ts", import.meta.url),
  "utf8"
);

test("mission persistence queue is explicitly retain-all", () => {
  const start = source.indexOf("function createMissionPersistenceQueue");
  assert.notEqual(start, -1);

  const end = source.indexOf("\n  return {", start);
  assert.notEqual(end, -1);

  const block = source.slice(start, end);
  assert.match(block, /dropPolicy:\s*"retain-all"/);
  assert.doesNotMatch(block, /capacity:\s*2_000/);
});
