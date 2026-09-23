import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const verifyPath = new URL("../../../scripts/verify.sh", import.meta.url);
const verifyScript = readFileSync(verifyPath, "utf8");

test("verify.sh remains POSIX-shell syntax compatible", () => {
  const result = spawnSync("sh", ["-n", verifyPath.pathname], {
    encoding: "utf8"
  });

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || "sh -n failed"
  );
});

test("verify cleanup preserves failures and turns cleanup failure into failure", () => {
  assert.match(
    verifyScript,
    /original_status=\$\?/
  );
  assert.match(
    verifyScript,
    /if ! cleanup_verify_artifacts; then/
  );
  assert.match(
    verifyScript,
    /if \[ "\$final_status" -eq 0 \]; then\s+final_status=1/
  );
  assert.doesNotMatch(
    verifyScript,
    /cleanup_verify_credential \|\| true/
  );
  assert.doesNotMatch(
    verifyScript,
    /cleanup_verify_marker \|\| true/
  );
});

test("verify signal exits still pass through EXIT cleanup", () => {
  assert.match(verifyScript, /trap 'finish_verify' 0/);
  assert.match(verifyScript, /trap 'exit 130' INT/);
  assert.match(verifyScript, /trap 'exit 143' TERM/);
});
