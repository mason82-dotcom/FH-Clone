import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rtk = fs.readFileSync(
  "apps/web/src/hooks/useRtkLive.ts",
  "utf8"
);
const overlays = fs.readFileSync(
  "apps/web/src/fh2/Fh2OverlayController.tsx",
  "utf8"
);

test("RTK SSE handlers use guarded JSON parsing", () => {
  assert.match(rtk, /function parseSseJson<[^>]+>\(event: Event\)/);
  assert.match(rtk, /try \{[\s\S]*?JSON\.parse[\s\S]*?catch \{[\s\S]*?return undefined/);
  assert.equal((rtk.match(/parseSseJson</g) ?? []).length >= 4, true);
});

test("overlay polling aborts superseded requests", () => {
  const abortControllers = overlays.match(/new AbortController\(\)/g) ?? [];
  assert.equal(abortControllers.length >= 3, true);
  assert.match(overlays, /signal:\s*request\.signal/);
  assert.match(overlays, /controller !== request/);
  assert.match(overlays, /controller\?\.abort\(\)/);
});
