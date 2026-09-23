import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  closeHttpServer,
  onceAsync,
  runShutdownSteps
} from "./shutdown.js";

test("shutdown steps continue after a failure and report it afterwards", async () => {
  const calls: string[] = [];

  await assert.rejects(
    runShutdownSteps([
      {
        name: "first",
        run() {
          calls.push("first");
          throw new Error("boom");
        }
      },
      {
        name: "second",
        run() {
          calls.push("second");
        }
      }
    ]),
    /Shutdown failed in 1 step/
  );

  assert.deepEqual(calls, ["first", "second"]);
});

test("onceAsync executes the shutdown task only once", async () => {
  let calls = 0;
  const shutdown = onceAsync(async () => {
    calls += 1;
    await Promise.resolve();
  });

  await Promise.all([shutdown(), shutdown(), shutdown()]);
  assert.equal(calls, 1);
});

test("closeHttpServer waits until a listening server is closed", async () => {
  const server = createServer((_request, response) => response.end("ok"));

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  assert.equal(server.listening, true);

  await closeHttpServer(server);
  assert.equal(server.listening, false);

  // Idempotent for already-closed servers.
  await closeHttpServer(server);
});
