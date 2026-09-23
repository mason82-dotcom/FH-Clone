import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script =
  "scripts/github-sensitive-data-support-handoff.mjs";

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "fh2-filter-repo-")
  );
  const metadata = path.join(root, "filter-repo");
  fs.mkdirSync(metadata, { recursive: true });

  fs.writeFileSync(
    path.join(metadata, "changed-refs"),
    [
      "refs/heads/main",
      "refs/pull/12/head",
      "refs/pull/27/head",
      "refs/tags/v2.9.0",
      "refs/remotes/origin/old"
    ].join("\n") + "\n"
  );

  fs.writeFileSync(
    path.join(metadata, "first-changed-commits"),
    [
      "1111111111111111111111111111111111111111",
      "2222222222222222222222222222222222222222"
    ].join("\n") + "\n"
  );

  fs.writeFileSync(
    path.join(metadata, "orphaned_lfs_objects"),
    "sha256:example\n"
  );

  return metadata;
}

test("safe mode reports counts without private ids", () => {
  const metadata = fixture();
  const result = spawnSync(
    process.execPath,
    [script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        FH2_FILTER_REPO_DIR: metadata
      }
    }
  );

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /affected pull-request refs: 2/
  );
  assert.match(
    result.stdout,
    /first changed commits: 2/
  );
  assert.doesNotMatch(
    result.stdout,
    /1111111111111111111111111111111111111111/
  );
  assert.doesNotMatch(
    result.stdout,
    /refs\/pull\/12\/head/
  );
});

test("private mode prints support-only refs and first changed commits", () => {
  const metadata = fixture();
  const result = spawnSync(
    process.execPath,
    [script, "--include-private"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        FH2_FILTER_REPO_DIR: metadata
      }
    }
  );

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /refs\/pull\/12\/head/
  );
  assert.match(
    result.stdout,
    /1111111111111111111111111111111111111111/
  );
  assert.match(
    result.stdout,
    /orphaned_lfs_objects/
  );
});

test("missing metadata fails without attempting a rewrite", () => {
  const missing = path.join(
    os.tmpdir(),
    "fh2-filter-repo-missing"
  );
  fs.rmSync(missing, {
    recursive: true,
    force: true
  });

  const result = spawnSync(
    process.execPath,
    [script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        FH2_FILTER_REPO_DIR: missing
      }
    }
  );

  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /Nicht blind erneut filtern/
  );
});
