import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "apps/web/src/components/fh2/Fh2Workspace.tsx",
  "utf8"
);

test("workspace refreshes DJI topology continuously without starving slow requests", () => {
  assert.match(source, /setInterval\([\s\S]*?refreshTopology[\s\S]*?2_000/);
  assert.match(source, /if \(controller\) return;/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal:\s*request\.signal/);
  assert.match(
    source,
    /finally \{[\s\S]*?controller === request[\s\S]*?controller = undefined/
  );
  assert.equal((source.match(/controller\?\.abort\(\);/g) ?? []).length, 1);
});

test("workspace preserves last known topology on transient fetch failure", () => {
  const catchBlock = source.match(
    /catch \(error\) \{([\s\S]*?)\n      \} finally/
  )?.[1] ?? "";
  assert.doesNotMatch(catchBlock, /setTopology\(\[\]\)/);
});

test("removed user-selected device returns selection to automatic mode", () => {
  assert.match(
    source,
    /selectionSource === "user"[\s\S]*?!pairs\.some[\s\S]*?setSelectionSource\("auto"\)[\s\S]*?setSelectedPair\(""\)/
  );
});
