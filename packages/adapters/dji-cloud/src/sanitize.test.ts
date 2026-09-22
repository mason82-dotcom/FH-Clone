import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_REDACTED_TELEMETRY_VALUE,
  sanitizeDjiRawPayload
} from "./sanitize.js";

test("M4D wireless link secret_code is redacted but topology remains usable", () => {
  const sanitized = sanitizeDjiRawPayload({
    data: {
      wireless_link_topo: {
        secret_code: Array.from({ length: 28 }, (_, index) => index),
        center_node: { sdr_id: 11, sn: "M4TD-001" },
        leaf_nodes: [
          { sdr_id: 12, sn: "DOCK3-001", control_source_index: 1 }
        ]
      }
    }
  }) as {
    data: {
      wireless_link_topo: {
        secret_code: unknown;
        center_node: { sn: string };
        leaf_nodes: Array<{ sn: string }>;
      };
    };
  };

  assert.equal(
    sanitized.data.wireless_link_topo.secret_code,
    DJI_REDACTED_TELEMETRY_VALUE
  );
  assert.equal(sanitized.data.wireless_link_topo.center_node.sn, "M4TD-001");
  assert.equal(sanitized.data.wireless_link_topo.leaf_nodes[0]?.sn, "DOCK3-001");
});
