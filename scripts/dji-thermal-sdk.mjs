import path from "node:path";

import {
  DJI_THERMAL_SDK_RELEASE_DATE,
  DJI_THERMAL_SDK_VERSION,
  createDjiThermalSdkFromEnv
} from "../packages/adapters/dji-thermal/dist/index.js";

function fail(message) {
  console.error(`DJI_THERMAL_SDK_ERROR: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {
    action: "probe",
    measurefmt: "float32",
    palette: "iron_red"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--action", "--input", "--output", "--measurefmt", "--palette"].includes(arg)) {
      const value = argv[i + 1];
      if (!value) throw new Error(`missing value for ${arg}`);
      i += 1;
      if (arg === "--action") out.action = value;
      if (arg === "--input") out.input = value;
      if (arg === "--output") out.output = value;
      if (arg === "--measurefmt") out.measurefmt = value;
      if (arg === "--palette") out.palette = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sdk = createDjiThermalSdkFromEnv();
  const status = await sdk.status();

  if (args.action === "status") {
    console.log(JSON.stringify(status, null, 2));
    if (!status.ready) process.exitCode = 2;
    return;
  }

  if (!status.ready) {
    console.log(JSON.stringify(status, null, 2));
    fail(status.reason ?? "not_ready");
    return;
  }

  if (args.action === "probe") {
    const result = await sdk.probe();
    console.log(JSON.stringify({
      sdk: {
        version: DJI_THERMAL_SDK_VERSION,
        releaseDate: DJI_THERMAL_SDK_RELEASE_DATE
      },
      status,
      probe: {
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      }
    }, null, 2));
    return;
  }

  if (!args.input || !args.output) {
    throw new Error("--input and --output are required for processing actions");
  }

  const input = path.resolve(args.input);
  const output = path.resolve(args.output);

  if (args.action === "measure") {
    if (!["int16", "float32"].includes(args.measurefmt)) {
      throw new Error("--measurefmt must be int16 or float32");
    }
    await sdk.measureRjpeg(input, output, args.measurefmt);
  } else if (args.action === "extract") {
    await sdk.extractRaw16(input, output);
  } else if (args.action === "process") {
    await sdk.renderPseudoColor(input, output, args.palette);
  } else {
    throw new Error("action must be status, probe, measure, extract or process");
  }

  console.log(JSON.stringify({
    ok: true,
    action: args.action,
    sdkVersion: DJI_THERMAL_SDK_VERSION,
    input,
    output
  }, null, 2));
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
