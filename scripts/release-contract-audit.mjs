import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function fail(message) {
  console.error(`release-contract-audit: ${message}`);
  process.exitCode = 1;
}

function expect(text, needle, label) {
  if (!text.includes(needle)) fail(`${label}: expected "${needle}"`);
}

function reject(text, needle, label) {
  if (text.includes(needle)) fail(`${label}: forbidden "${needle}"`);
}

const gradle = read("android/fh2-rc-bridge/gradle.properties");
const androidReadme = read("android/fh2-rc-bridge/README.md");
const hardwareDoc = read("docs/HARDWARE_EVIDENCE.md");
const hardwareAudit = read("scripts/hardware-evidence-audit.mjs");
const workflow = read(".github/workflows/director-v3-validation.yml");

const properties = Object.fromEntries(
  gradle
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    })
);

const expected = {
  ANDROID_MIN_SDK_VERSION: "24",
  ANDROID_TARGET_SDK_VERSION: "35",
  ANDROID_COMPILE_SDK_VERSION: "35",
  ANDROID_BUILD_TOOLS_VERSION: "35.0.0",
  DJI_MSDK_VERSION: "5.18.0",
  ANDROIDX_CORE_VERSION: "1.16.0",
  ANDROIDX_APPCOMPAT_VERSION: "1.7.1"
};

for (const [key, value] of Object.entries(expected)) {
  if (properties[key] !== value) {
    fail(`gradle.properties: ${key} expected ${value}, got ${properties[key] ?? "<missing>"}`);
  }
}

for (const line of [
  "- Android minSdk 24",
  "- compileSdk 35",
  "- targetSdk 35",
  "- Android Build Tools 35.0.0",
  "compileSdk = 35",
  "targetSdk  = 35",
  "BuildTools = 35.0.0",
  "Core-KTX   = 1.16.0",
  "AppCompat  = 1.7.1",
  "DJI MSDK   = 5.18.0"
]) {
  expect(androidReadme, line, "android README");
}

for (const stale of [
  "compileSdk 36",
  "compileSdk = 36",
  "BuildTools = 36.0.0",
  "Core-KTX   = 1.17.0",
  "AppCompat  = 1.8.0"
]) {
  reject(androidReadme, stale, "android README");
}

for (const heading of [
  "## 1. RC Pro Enterprise + M3T — REQUIRED_HARDWARE",
  "## 2. RC Plus 2 + M4T Cloud-Flight-Control — REQUIRED_HARDWARE",
  "## 3. Mavic 3M Multispektral — REQUIRED_HARDWARE"
]) {
  expect(hardwareDoc, heading, "hardware evidence documentation");
}

for (const gate of ["M3T_RC_PRO", "M4T_RC_PLUS2", "M4T_MEDIA", "M3M"]) {
  reject(
    hardwareAudit,
    `"${gate}", "REQUIRED_MAIN"`,
    "hardware evidence audit"
  );
}

expect(
  hardwareAudit,
  'if (level === "REQUIRED_HARDWARE") return scope === "all";',
  "hardware evidence strict-scope contract"
);

const hardwareJob = workflow.slice(workflow.indexOf("\n  hardware-evidence:"));
reject(hardwareJob, "continue-on-error:", "hardware evidence workflow");
expect(
  workflow,
  "run: node scripts/release-contract-audit.mjs",
  "director documentation gate"
);

if (!process.exitCode) {
  console.log("release-contract-audit: PASS");
}
