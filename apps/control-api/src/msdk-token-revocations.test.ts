import assert from "node:assert/strict";
import test from "node:test";

import {
  MsdkTokenRevocationStore,
  hashMsdkAgentToken
} from "./msdk-token-revocations.js";

test("stores only a stable token digest and expires revocation locally", async () => {
  let now = 10_000;
  const store = new MsdkTokenRevocationStore({
    now: () => now
  });

  await store.initialize();
  assert.equal(store.persistent, false);
  assert.equal(
    hashMsdkAgentToken("agent-token"),
    hashMsdkAgentToken("agent-token")
  );
  assert.notEqual(
    hashMsdkAgentToken("agent-token"),
    "agent-token"
  );

  await store.revoke("agent-token", 20_000);
  assert.equal(store.isRevoked("agent-token"), true);
  assert.equal(store.isRevoked("other-token"), false);

  now = 20_000;
  assert.equal(store.isRevoked("agent-token"), false);
  await store.close();
});
