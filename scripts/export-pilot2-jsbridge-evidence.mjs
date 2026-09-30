#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadProjectSources,
  validatePilotBridgeSources
} from "./verify-pilot2-jsbridge.mjs";

const MODULES = [
  "thing",
  "liveshare",
  "api",
  "ws",
  "map",
  "tsa",
  "media",
  "mission"
];

const FORBIDDEN_KEYS = new Set([
  "remotecontrollersn",
  "aircraftsn",
  "gatewaysn",
  "devicesn",
  "sn",
  "password",
  "token",
  "auth_token",
  "secret",
  "device_secret",
  "nonce",
  "latitude",
  "longitude"
]);

function fail(message) {
  console.error(`PILOT2_JSBRIDGE_EVIDENCE_EXPORT_ERROR: ${message}`);
  process.exit(1);
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hasForbiddenKey(value) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (record(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
        stack.push(child);
      }
    } else if (Array.isArray(current)) {
      stack.push(...current);
    }
  }
  return false;
}

function validHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function finalizePilot2Evidence(value, safetyResult) {
  if (!record(value)) throw new Error("evidence_not_object");
  if (
    value.schema !== "fh2.pilot2-jsbridge.v1" ||
    value.realHardware !== true ||
    value.synthetic !== false ||
    value.redacted !== true
  ) {
    throw new Error("invalid_evidence_header");
  }
  if (
    value.bridgePresent !== true ||
    value.platformIsVerified !== true ||
    value.topologyPairMatch !== true ||
    value.moduleInventoryCaptured !== true
  ) {
    throw new Error("incomplete_runtime_evidence");
  }
  if (
    typeof value.platformVersion !== "string" ||
    value.platformVersion.length === 0 ||
    !validHash(value.remoteControllerSnSha256) ||
    !validHash(value.aircraftSnSha256)
  ) {
    throw new Error("invalid_identity_or_version");
  }
  if (!record(value.modules)) {
    throw new Error("module_inventory_missing");
  }
  for (const module of MODULES) {
    if (typeof value.modules[module] !== "boolean") {
      throw new Error(`module_state_missing:${module}`);
    }
  }
  if (hasForbiddenKey(value)) {
    throw new Error("raw_identifier_or_sensitive_key_present");
  }
  if (!safetyResult?.ok) {
    throw new Error(
      `browser_bundle_safety_failed:${(safetyResult?.errors ?? []).join(",")}`
    );
  }

  const canonical = JSON.stringify(value);
  return {
    ...value,
    browserBundleSecretScanPass: true,
    captureSha256: sha256(Buffer.from(canonical, "utf8"))
  };
}

function privateHttpHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validateBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("invalid Control API base URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    fail("Control API base URL must use http:// or https://");
  }
  if (url.protocol === "http:" && !privateHttpHost(url.hostname)) {
    fail("plain HTTP is allowed only for localhost/private-LAN Control API");
  }
  return url;
}

async function main() {
  const args = process.argv.slice(2);
  const realIndex = args.indexOf("--real-hardware");
  if (realIndex < 0) {
    fail("use --real-hardware explicitly for a real Pilot 2 capture");
  }
  args.splice(realIndex, 1);

  if (args.length > 2) {
    fail(
      "usage: node scripts/export-pilot2-jsbridge-evidence.mjs --real-hardware [control-api-base-url] [output.json]"
    );
  }

  const baseUrl = validateBaseUrl(
    args[0] ??
      process.env.FH2_CONTROL_API_BASE_URL ??
      "http://127.0.0.1:8082"
  );
  const outputPath = path.resolve(
    args[1] ?? "docs/fixtures/pilot2/jsbridge-session.json"
  );
  const endpoint = new URL("/api/dji/pilot2/evidence/latest", baseUrl);

  let response;
  try {
    response = await fetch(endpoint, {
      headers: { accept: "application/json" }
    });
  } catch (error) {
    fail(
      `cannot reach Control API: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    fail(
      response.status === 404
        ? "no Pilot 2 evidence captured yet; open /pilot-evidence in DJI Pilot 2 and capture first"
        : `Control API returned HTTP ${response.status}`
    );
  }

  const evidence = await response.json();
  const safetyResult = validatePilotBridgeSources(loadProjectSources());
  let finalized;
  try {
    finalized = finalizePilot2Evidence(evidence, safetyResult);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(finalized, null, 2) + "\n", {
    mode: 0o600
  });

  console.log("PILOT2_JSBRIDGE_EVIDENCE_EXPORT=OK");
  console.log(`OUTPUT=${outputPath}`);
  console.log(`CAPTURE_SHA256=${finalized.captureSha256}`);
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  await main();
}
