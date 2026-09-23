import assert from "node:assert/strict";
import test from "node:test";

import { queryInt } from "./http-query.js";

function url(query: string): URL {
  return new URL(`http://localhost/?${query}`);
}

test("queryInt accepts strict decimal integers", () => {
  assert.equal(queryInt(url("page=10"), "page", 1, 1, 100), 10);
});

test("queryInt rejects numeric prefixes, decimals and exponent notation", () => {
  for (const raw of ["10abc", "1.5", "1e2", "+10", "%2010"]) {
    assert.throws(
      () => queryInt(url(`page=${raw}`), "page", 1, 1, 100),
      /invalid_query_page/
    );
  }
});

test("queryInt enforces safe integer range and fallback", () => {
  assert.equal(queryInt(url(""), "page", 7, 1, 100), 7);
  assert.throws(
    () =>
      queryInt(
        url("page=9007199254740992"),
        "page",
        1,
        1,
        Number.MAX_SAFE_INTEGER
      ),
    /invalid_query_page/
  );
});
