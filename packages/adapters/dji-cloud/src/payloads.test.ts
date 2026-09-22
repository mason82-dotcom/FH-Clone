import assert from "node:assert/strict";
import test from "node:test";

import { getDjiPayloadProfile } from "./payloads.js";

test("M4D/M4TD camera payload identities are registered separately from Pilot M4", () => {
  assert.deepEqual(getDjiPayloadProfile("98-0-0"), {
    payloadIndex: "98-0-0",
    name: "DJI Matrice 4D Camera",
    family: "matrice-4d",
    thermal: false
  });

  assert.deepEqual(getDjiPayloadProfile("99-0-0"), {
    payloadIndex: "99-0-0",
    name: "DJI Matrice 4TD Camera",
    family: "matrice-4d",
    thermal: true
  });

  assert.equal(getDjiPayloadProfile("89-0-0")?.family, "matrice-4");
});
