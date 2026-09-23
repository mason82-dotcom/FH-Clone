#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_CALLS = [
  ["platformVerifyLicense", /\.platformVerifyLicense\s*\(/],
  ["platformLoadComponent", /\.platformLoadComponent\s*\(/],
  ["platformUnloadComponent", /\.platformUnloadComponent\s*\(/],
  ["platformSetWorkspaceId", /\.platformSetWorkspaceId\s*\(/],
  ["platformSetInformation", /\.platformSetInformation\s*\(/],
  ["platformSetLogEncryptKey", /\.platformSetLogEncryptKey\s*\(/],
  ["platformStopSelf", /\.platformStopSelf\s*\(/],
  ["apiGetToken", /\.apiGetToken\s*\(/],
  ["apiSetToken", /\.apiSetToken\s*\(/],
  ["thingConnect", /\.thingConnect\s*\(/],
  ["thingDisconnect", /\.thingDisconnect\s*\(/],
  ["thingSetConnectCallback", /\.thingSetConnectCallback\s*\(/],
  ["thingGetConfigs", /\.thingGetConfigs\s*\(/],
  ["wsConnect", /\.wsConnect\s*\(/],
  ["wsDisconnect", /\.wsDisconnect\s*\(/],
  ["wsSend", /\.wsSend\s*\(/],
  ["liveshareSetConfig", /\.liveshareSetConfig\s*\(/],
  ["liveshareStartLive", /\.liveshareStartLive\s*\(/],
  ["liveshareStopLive", /\.liveshareStopLive\s*\(/],
  ["mediaSet", /\.mediaSet[A-Za-z0-9_]*\s*\(/]
];

const FORBIDDEN_VITE_SECRET =
  /\bVITE_[A-Z0-9_]*(APP_KEY|LICENSE|TOKEN|PASSWORD|SECRET|MQTT|EMQX|DRC)[A-Z0-9_]*\b/;

const REQUIRED_CALLS = [
  ["platformIsVerified", /\.platformIsVerified\s*\(/],
  ["platformGetVersion", /\.platformGetVersion\s*\(/],
  ["platformGetRemoteControllerSN", /\.platformGetRemoteControllerSN\s*\(/],
  ["platformGetAircraftSN", /\.platformGetAircraftSN\s*\(/],
  ["platformIsComponentLoaded", /\.platformIsComponentLoaded\s*\(/]
];

export function validatePilotBridgeSources(entries) {
  const errors = [];
  const combined = entries
    .map((entry) => `\n/* ${entry.name} */\n${entry.content}`)
    .join("\n");

  for (const [name, pattern] of FORBIDDEN_CALLS) {
    if (pattern.test(combined)) {
      errors.push(`forbidden_jsbridge_call:${name}`);
    }
  }

  if (FORBIDDEN_VITE_SECRET.test(combined)) {
    errors.push("forbidden_vite_secret");
  }

  for (const [name, pattern] of REQUIRED_CALLS) {
    if (!pattern.test(combined)) {
      errors.push(`required_readonly_call_missing:${name}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function collectFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(?:ts|tsx|d\.ts)$/.test(entry.name)) {
      out.push({
        name: full,
        content: fs.readFileSync(full, "utf8")
      });
    }
  }
  return out;
}

export function loadProjectSources(cwd = process.cwd()) {
  const files = collectFiles(
    path.join(cwd, "apps/web/src/pilot-bridge")
  );

  for (const relative of [
    ".env.example",
    "compose.yaml",
    "infra/docker/web.Dockerfile"
  ]) {
    const full = path.join(cwd, relative);
    if (fs.existsSync(full)) {
      files.push({
        name: relative,
        content: fs.readFileSync(full, "utf8")
      });
    }
  }

  return files;
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const result = validatePilotBridgeSources(
    loadProjectSources()
  );

  if (result.ok) {
    console.log("FH2 Pilot2 JSBridge Safety: OK");
  } else {
    console.error("FH2 Pilot2 JSBridge Safety: FEHLER");
    result.errors.forEach((error) =>
      console.error(`- ${error}`)
    );
    process.exitCode = 1;
  }
}
