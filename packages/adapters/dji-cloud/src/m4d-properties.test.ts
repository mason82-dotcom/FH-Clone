import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_DOCK3_PRODUCT,
  DJI_M4D_PRODUCTS,
  DJI_M4D_PROPERTY_TOPICS,
  DJI_M4D_WRITABLE_PROPERTY_PATHS,
  isDjiM4dSensitivePropertyPath
} from "./m4d-properties.js";

test("M4D/M4TD and Dock 3 use DJI documented identities", () => {
  assert.deepEqual(DJI_DOCK3_PRODUCT, {
    domain: 3,
    type: 3,
    subType: 0,
    name: "DJI Dock 3"
  });

  assert.equal(DJI_M4D_PRODUCTS.m4d.type, 100);
  assert.equal(DJI_M4D_PRODUCTS.m4d.subType, 0);
  assert.equal(DJI_M4D_PRODUCTS.m4d.payloadIndex, "98-0-0");
  assert.equal(DJI_M4D_PRODUCTS.m4td.type, 100);
  assert.equal(DJI_M4D_PRODUCTS.m4td.subType, 1);
  assert.equal(DJI_M4D_PRODUCTS.m4td.payloadIndex, "99-0-0");
});

test("M4D property contract keeps OSD, state and property/set topics separate", () => {
  assert.equal(DJI_M4D_PROPERTY_TOPICS.osd, "thing/product/{device_sn}/osd");
  assert.equal(DJI_M4D_PROPERTY_TOPICS.state, "thing/product/{device_sn}/state");
  assert.equal(DJI_M4D_PROPERTY_TOPICS.set, "thing/product/{gateway_sn}/property/set");
});

test("M4D secret_code is classified as sensitive while topology identities remain usable", () => {
  assert.equal(
    isDjiM4dSensitivePropertyPath("wireless_link_topo.secret_code"),
    true
  );
  assert.equal(
    isDjiM4dSensitivePropertyPath("data.wireless_link_topo.secret_code"),
    true
  );
  assert.equal(
    isDjiM4dSensitivePropertyPath("wireless_link_topo.center_node.sn"),
    false
  );
});

test("M4D writable-property registry is explicit and does not imply a public write API", () => {
  assert.equal(DJI_M4D_WRITABLE_PROPERTY_PATHS.includes("height_limit"), true);
  assert.equal(
    DJI_M4D_WRITABLE_PROPERTY_PATHS.includes(
      "type_subtype_gimbalindex.thermal_gain_mode"
    ),
    true
  );
});
