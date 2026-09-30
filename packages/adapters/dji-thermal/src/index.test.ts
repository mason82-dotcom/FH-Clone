import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DJI_THERMAL_SDK_VERSION,
  DjiThermalSdkCli,
  resolveDjiThermalSdkLayout
} from "./index.js";

test("resolves the official Linux x64 TSDK layout", () => {
  const layout = resolveDjiThermalSdkLayout({
    sdkHome: "/opt/dji-tsdk",
    platform: "linux",
    arch: "x64"
  });

  assert.equal(
    layout?.irpPath,
    "/opt/dji-tsdk/utility/bin/linux/release_x64/dji_irp"
  );
  assert.equal(
    layout?.libDir,
    "/opt/dji-tsdk/tsdk-core/lib/linux/release_x64"
  );
});

test("does not invent an official Linux ARM64 layout", async () => {
  const sdk = new DjiThermalSdkCli({
    sdkHome: "/opt/dji-tsdk",
    platform: "linux",
    arch: "arm64"
  });

  const status = await sdk.status();
  assert.equal(status.ready, false);
  assert.equal(
    status.reason,
    "official_v1_8_has_no_known_linux_arm64_layout"
  );
  assert.equal(status.version, DJI_THERMAL_SDK_VERSION);
});

test("explicit binary remains available for custom architectures", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX executable fixture");
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-tsdk-"));
  const bin = path.join(dir, "dji_irp");
  fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const sdk = new DjiThermalSdkCli({
    irpBin: bin,
    platform: "linux",
    arch: "arm64"
  });
  const status = await sdk.status();

  assert.equal(status.ready, true);
  assert.equal(status.source, "explicit");
});

test("measure invokes dji_irp with fail-closed argument construction", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX executable fixture");
    return;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-tsdk-"));
  const argsPath = path.join(dir, "args.txt");
  const bin = path.join(dir, "dji_irp");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
printf '%s\\n' "$@" > "${argsPath}"
exit 0
`,
    { mode: 0o755 }
  );

  const sdk = new DjiThermalSdkCli({
    irpBin: bin,
    platform: "linux",
    arch: "x64"
  });

  await sdk.measureRjpeg(
    path.join(dir, "input R.JPG"),
    path.join(dir, "temperature.raw"),
    "float32"
  );

  assert.deepEqual(
    fs.readFileSync(argsPath, "utf8").trim().split("\n"),
    [
      "-s",
      path.join(dir, "input R.JPG"),
      "-a",
      "measure",
      "-o",
      path.join(dir, "temperature.raw"),
      "--measurefmt",
      "float32"
    ]
  );
});

test("pseudo-color palette is constrained before spawning the SDK", async () => {
  const sdk = new DjiThermalSdkCli({
    irpBin: "/does/not/matter"
  });

  await assert.rejects(
    () => sdk.renderPseudoColor("input.jpg", "output.raw", "iron_red;rm"),
    /invalid_thermal_palette/
  );
});
