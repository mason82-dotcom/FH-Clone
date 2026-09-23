import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const remote = fs.readFileSync(
  "android/fh2-rc-bridge/app/src/main/java/com/fh2/rcbridge/RemoteControlSession.kt",
  "utf8"
);
const client = fs.readFileSync(
  "android/fh2-rc-bridge/app/src/main/java/com/fh2/rcbridge/MsdkControlClient.kt",
  "utf8"
);

test("local remote-control dead-man emits a callback after disabling authority", () => {
  assert.match(
    remote,
    /VirtualStickController\.disable\s*\{\s*\}[\s\S]*?active\s*=\s*false[\s\S]*?onDeadmanTimeout\?\.invoke\(\)/
  );
});

test("MSDK control client reports local dead-man to backend", () => {
  assert.match(
    client,
    /RemoteControlSession\([\s\S]*?onDeadmanTimeout\s*=\s*\{[\s\S]*?failClosed\([\s\S]*?"local_deadman_timeout"[\s\S]*?notifyServer\s*=\s*true/
  );
});
