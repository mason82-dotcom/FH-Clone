import assert from "node:assert/strict";
import test from "node:test";

import { parseDjiPilotWaylineListQuery } from "./dji-pilot-waylines.js";

test("parses DJI Pilot Wayline filters using repeated array query parameters", () => {
  const url = new URL(
    "http://localhost/api/dji/pilot/waylines?page=2&page_size=25&favorited=false" +
      "&key=M3M%20Survey&action_type=1&order_by=update_time%20desc" +
      "&template_type=0&template_type=2" +
      "&drone_model_keys=0-77-2&drone_model_keys=0-67-1" +
      "&payload_model_key=1-68-0"
  );

  assert.deepEqual(parseDjiPilotWaylineListQuery(url), {
    page: 2,
    pageSize: 25,
    key: "M3M Survey",
    favorited: false,
    actionType: 1,
    orderBy: "update_time desc",
    templateTypes: [0, 2],
    droneModelKeys: ["0-77-2", "0-67-1"],
    payloadModelKeys: ["1-68-0"]
  });
});

test("uses read-only catalog pagination defaults", () => {
  assert.deepEqual(
    parseDjiPilotWaylineListQuery(new URL("http://localhost/api/dji/pilot/waylines")),
    { page: 1, pageSize: 10 }
  );
});

test("rejects malformed boolean and integer filters", () => {
  assert.throws(
    () =>
      parseDjiPilotWaylineListQuery(
        new URL("http://localhost/api/dji/pilot/waylines?favorited=maybe")
      ),
    /invalid_query_favorited/
  );

  assert.throws(
    () =>
      parseDjiPilotWaylineListQuery(
        new URL("http://localhost/api/dji/pilot/waylines?template_type=nope")
      ),
    /invalid_query_template_type/
  );

  for (const query of [
    "page=2foo",
    "page_size=25.5",
    "action_type=1x",
    "action_type=0",
    "action_type=2",
    "template_type=2x",
    "template_type=4",
    "order_by=updated_at%20desc",
    "order_by=name"
  ]) {
    assert.throws(
      () =>
        parseDjiPilotWaylineListQuery(
          new URL(`http://localhost/api/dji/pilot/waylines?${query}`)
        ),
      /invalid_query_/
    );
  }
});
