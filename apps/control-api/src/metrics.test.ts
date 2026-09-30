import assert from "node:assert/strict";
import test from "node:test";

import { ControlApiMetrics } from "./metrics.js";

const queue = {
  pending: 2,
  dropped: 1,
  healthy: false
};

test("metrics expose bounded operational state without device identifiers", () => {
  const metrics = new ControlApiMetrics();
  metrics.observeMqttOutbound("basic", "update_topo");
  metrics.observeMqttOutbound("drc", "heart_beat");
  metrics.observeAuthzDecision("deny", "gateway_topology_mismatch");

  const rendered = metrics.render({
    uptimeSeconds: 12,
    djiConfigured: true,
    djiConnected: true,
    activeMissions: 1,
    mediaAssets: 3,
    activeDrcSessions: 0,
    msdkAgents: 1,
    msdkControlSessions: 0,
    missionQueue: queue,
    telemetryQueue: queue,
    topologyQueue: queue
  });

  assert.match(rendered, /fh2_dji_mqtt_connected 1/);
  assert.match(
    rendered,
    /fh2_mqtt_outbound_total\{transport="basic",method="update_topo"\} 1/
  );
  assert.match(
    rendered,
    /fh2_authz_decisions_total\{decision="deny",reason="gateway_topology_mismatch"\} 1/
  );
  assert.equal(rendered.includes("AIRCRAFT-"), false);
  assert.equal(rendered.includes("gateway_sn"), false);
});

test("unbounded metric labels collapse to other", () => {
  const metrics = new ControlApiMetrics();
  metrics.observeMqttOutbound("basic", "bad method with spaces and /slashes");
  metrics.observeAuthzDecision("deny", "bad reason with spaces");

  const rendered = metrics.render({
    uptimeSeconds: 0,
    djiConfigured: false,
    djiConnected: false,
    activeMissions: 0,
    mediaAssets: 0,
    activeDrcSessions: 0,
    msdkAgents: 0,
    msdkControlSessions: 0,
    missionQueue: { pending: 0, dropped: 0, healthy: true },
    telemetryQueue: { pending: 0, dropped: 0, healthy: true },
    topologyQueue: { pending: 0, dropped: 0, healthy: true }
  });

  assert.match(rendered, /method="other"/);
  assert.match(rendered, /reason="other"/);
});
