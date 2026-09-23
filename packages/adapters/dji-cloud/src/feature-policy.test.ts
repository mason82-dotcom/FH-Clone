import assert from "node:assert/strict";
import test from "node:test";

import {
  containsGloballyDisabledMultiDockData,
  getGloballyDisabledServiceReason,
  isGloballyDisabledDockProduct,
  isGloballyDisabledPsdkMethod,
  sanitizeGloballyDisabledDjiFields
} from "./feature-policy.js";

test("all DJI Dock domain products are globally disabled", () => {
  assert.equal(
    isGloballyDisabledDockProduct({ domain: 3, type: 1, subType: 0 }),
    true
  );
  assert.equal(
    isGloballyDisabledDockProduct({ domain: "3", type: 2, subType: 0 }),
    true
  );
  assert.equal(
    isGloballyDisabledDockProduct({ domain: 3, type: 3, subType: 0 }),
    true
  );
  assert.equal(
    isGloballyDisabledDockProduct({ domain: 2, type: 174, subType: 0 }),
    false
  );
});

test("PSDK service methods are blocked without blocking native DJI payload services", () => {
  assert.equal(isGloballyDisabledPsdkMethod("psdk_widget_value_set"), true);
  assert.equal(isGloballyDisabledPsdkMethod("drc_psdk_widget_value_set"), true);
  assert.equal(isGloballyDisabledPsdkMethod("camera_mode_switch"), false);
  assert.equal(isGloballyDisabledPsdkMethod("payload_authority_grab"), false);
});

test("Multi-Dock data is detected recursively", () => {
  assert.equal(
    containsGloballyDisabledMultiDockData({
      mission: {
        multi_dock_task: {
          dock_infos: []
        }
      }
    }),
    true
  );
  assert.equal(
    containsGloballyDisabledMultiDockData({
      mission: {
        waypoint_count: 3
      }
    }),
    false
  );
});

test("disabled PSDK and Multi-Dock fields are stripped while native cameras remain", () => {
  const sanitized = sanitizeGloballyDisabledDjiFields({
    data: {
      cameras: [{ payload_index: "67-0-0" }],
      psdk_ui_resource: [{ psdk_index: 1 }],
      psdk_widget_values: [{ psdk_index: 1, psdk_name: "third-party" }],
      wireless_link_topo: { secret_code: "must-not-flow" },
      multi_dock_home_info: [{ sn: "dock" }],
      nested: {
        best_link_gateway: "dock-a",
        value: 42
      }
    }
  }) as {
    data: Record<string, unknown>;
  };

  assert.deepEqual(sanitized.data.cameras, [{ payload_index: "67-0-0" }]);
  assert.equal("psdk_ui_resource" in sanitized.data, false);
  assert.equal("psdk_widget_values" in sanitized.data, false);
  assert.equal("wireless_link_topo" in sanitized.data, false);
  assert.equal("multi_dock_home_info" in sanitized.data, false);
  assert.deepEqual(sanitized.data.nested, { value: 42 });
});

test("service policy blocks PSDK and Multi-Dock requests", () => {
  assert.match(
    getGloballyDisabledServiceReason("psdk_widget_value_set", {}) ?? "",
    /PSDK/
  );
  assert.match(
    getGloballyDisabledServiceReason("flighttask_execute", {
      multi_dock_task: { dock_infos: [] }
    }) ?? "",
    /Multi-Dock/
  );
  assert.equal(
    getGloballyDisabledServiceReason("camera_mode_switch", {
      payload_index: "67-0-0"
    }),
    undefined
  );
});
