import assert from "node:assert/strict";
import test from "node:test";
import { DjiCloudControlAuthorityRegistry } from "./cloud-authority.js";
import { DjiPilotCloudAuthorityCoordinator } from "./pilot-authority.js";
import type { DjiServiceReply, DjiServiceRequester } from "./service.js";

class FakeServiceRequester implements DjiServiceRequester {
  requests: Array<{ gatewaySn: string; method: string; data: unknown }> = [];
  result = 0;

  async requestService(
    gatewaySn: string,
    method: string,
    data: unknown
  ): Promise<DjiServiceReply> {
    this.requests.push({ gatewaySn, method, data });
    return {
      tid: "test-tid",
      result: this.result,
      data: { result: this.result },
      method
    };
  }
}

test("waits for pilot consent event after service request", async () => {
  const services = new FakeServiceRequester();
  const registry = new DjiCloudControlAuthorityRegistry();
  const coordinator = new DjiPilotCloudAuthorityCoordinator(
    services,
    registry
  );

  const pending = coordinator.requestFlightAuthority("RC-PLUS-2", {
    userId: "operator-1",
    userCallsign: "Pilot Cloud",
    timeoutMs: 1_000
  });

  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(registry.get("RC-PLUS-2")?.status, "pending");
  assert.equal(services.requests[0]?.method, "cloud_control_auth_request");

  registry.applyEvent("RC-PLUS-2", {
    method: "cloud_control_auth_notify",
    data: {
      result: 0,
      output: { status: "ok" }
    }
  });

  const state = await pending;
  assert.equal(state.status, "authorized");
  assert.equal(state.authorized, true);
});

test("does not treat empty cloud_control_auth state as denial while popup is pending", () => {
  const registry = new DjiCloudControlAuthorityRegistry();
  registry.markPending("RC-PLUS-2");

  const state = registry.applyState("RC-PLUS-2", {
    data: {
      cloud_control_auth: []
    }
  });

  assert.equal(state?.status, "pending");
  assert.equal(state?.authorized, false);
});

test("cloud_control_auth property confirms flight authority", () => {
  const registry = new DjiCloudControlAuthorityRegistry();

  const state = registry.applyState("RC-PLUS-2", {
    data: {
      cloud_control_auth: ["flight"]
    }
  });

  assert.equal(state?.status, "authorized");
  assert.equal(state?.authorized, true);
});

test("pilot denial rejects the request", async () => {
  const services = new FakeServiceRequester();
  const registry = new DjiCloudControlAuthorityRegistry();
  const coordinator = new DjiPilotCloudAuthorityCoordinator(
    services,
    registry
  );

  const pending = coordinator.requestFlightAuthority("RC-PLUS-2", {
    userId: "operator-1",
    userCallsign: "Pilot Cloud",
    timeoutMs: 1_000
  });

  await new Promise<void>((resolve) => setImmediate(resolve));

  registry.applyEvent("RC-PLUS-2", {
    method: "cloud_control_auth_notify",
    data: {
      result: 0,
      output: { status: "failed" }
    }
  });

  await assert.rejects(pending, /status denied/);
  assert.equal(registry.get("RC-PLUS-2")?.authorized, false);
});

test("authorization times out fail-closed", async () => {
  const services = new FakeServiceRequester();
  const registry = new DjiCloudControlAuthorityRegistry();
  const coordinator = new DjiPilotCloudAuthorityCoordinator(
    services,
    registry
  );

  await assert.rejects(
    coordinator.requestFlightAuthority("RC-PLUS-2", {
      userId: "operator-1",
      userCallsign: "Pilot Cloud",
      timeoutMs: 10
    }),
    /status timeout/
  );

  assert.equal(registry.get("RC-PLUS-2")?.status, "timeout");
  assert.equal(registry.get("RC-PLUS-2")?.authorized, false);
});

test("release uses cloud_control_release and clears local authority", async () => {
  const services = new FakeServiceRequester();
  const registry = new DjiCloudControlAuthorityRegistry();
  registry.applyState("RC-PLUS-2", {
    data: {
      cloud_control_auth: ["flight"]
    }
  });

  const coordinator = new DjiPilotCloudAuthorityCoordinator(
    services,
    registry
  );

  const state = await coordinator.releaseFlightAuthority("RC-PLUS-2");

  assert.equal(services.requests.at(-1)?.method, "cloud_control_release");
  assert.equal(state.status, "released");
  assert.equal(state.authorized, false);
});
