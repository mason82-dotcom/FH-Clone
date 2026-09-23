import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`CONTROL_POLICY_AUDIT_FAIL: ${message}`);
  process.exitCode = 1;
};

const capabilitiesPath = "packages/adapters/dji-cloud/src/capabilities.ts";
const capabilities = read(capabilitiesPath);
const m3Start = capabilities.indexOf("if (isMavic3Enterprise(aircraft))");
const m4Start = capabilities.indexOf("if (isMatrice4Enterprise(aircraft))");

if (m3Start < 0 || m4Start <= m3Start) {
  fail("M3/M4 capability blocks could not be located.");
} else {
  const m3 = capabilities.slice(m3Start, m4Start);
  const required = [
    [/cloudControl,/, "M3 must retain explicit cloud-control authority/payload context"],
    [/flightControl:\s*false/, "M3 flightControl must remain false"],
    [/stickControl:\s*false/, "M3 stickControl must remain false"],
    [/droneControl:\s*false/, "M3 droneControl must remain false"],
    [/payloadControl:\s*cloudControl/, "M3 payloadControl must follow cloud-control availability"],
    [/drcProfile:\s*"none"/, "M3 DRC profile must remain none"]
  ];

  for (const [pattern, message] of required) {
    if (!pattern.test(m3)) fail(message);
  }
}

const policyDocs = [
  "README.md",
  "CHANGELOG.md",
  "apps/control-api/README.md",
  "docs/COMPATIBILITY.md",
  "docs/DJI_CAPABILITY_MATRIX.md",
  "docs/DRC.md",
  "docs/HARDWARE_EVIDENCE.md",
  "docs/RC_PRO.md",
  "docs/RELEASE_STATUS.md"
];

const combined = policyDocs
  .map((path) => `\n--- ${path} ---\n${read(path)}`)
  .join("\n");

const forbidden = [
  [/pilot-m3-drone/i, "legacy pilot-m3-drone profile is forbidden"],
  [/`stick_control`:\s*global deaktiviert/i, "stick_control is not globally disabled"],
  [/`stick_control`\s*global gesperrt/i, "stick_control is not globally disabled"],
  [/FH2 deaktiviert\s+`stick_control`\s+global/i, "stick_control is not globally disabled"]
];

for (const [pattern, message] of forbidden) {
  if (pattern.test(combined)) fail(message);
}

const rcPro = read("docs/RC_PRO.md");
for (const [pattern, message] of [
  [/`flightControl = false`/, "RC_PRO must document M3 flightControl=false"],
  [/`droneControl = false`/, "RC_PRO must document M3 droneControl=false"],
  [/`payloadControl = true`/, "RC_PRO must document M3 payloadControl=true"],
  [/`DjiDrcProfile = none`/, "RC_PRO must document M3 DRC profile none"]
]) {
  if (!pattern.test(rcPro)) fail(message);
}

if (!process.exitCode) {
  console.log("CONTROL_POLICY_AUDIT_PASS");
}
