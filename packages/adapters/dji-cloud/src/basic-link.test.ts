import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TOPICS } from "./index.js";

test("default Basic-Link topics contain no DRC channels", () => {
  assert.equal(
    DEFAULT_TOPICS.some((topic) => topic.includes("/drc/")),
    false
  );
});


test("uses only the canonical Pilot topology status topic", () => {
  assert.equal(DEFAULT_TOPICS.includes("sys/product/+/status"), true);
  assert.equal(DEFAULT_TOPICS.includes("thing/product/+/status"), false);
});
