#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FORBIDDEN_KEYS = /^(agentToken|pairingToken|password|secret|authorization|bearerToken|djiAppKey|apiKey)$/i;
const RAW_BEARER = /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i;

export function validateEvidenceDocuments(
  documents,
  { acceptance = false, keyManager = false } = {}
) {
  const errors = [];
  const summaries = [];
  const allMarkers = [];
  const allAcceptanceSignals = [];
  let reconnectObserved = false;
  let unpairCompleted = false;
  let keyManagerObserved = false;
  let keyManagerSupportedObserved = false;
  let keyManagerWritableMetadataObserved = false;
  let keyManagerLensScopedObserved = false;

  for (const entry of documents) {
    const name = entry.name ?? "<memory>";
    const document = entry.document;

    if (!isObject(document)) {
      errors.push(`${name}: root_not_object`);
      continue;
    }
    if (document.schema !== "fh2.msdk.v1") {
      errors.push(`${name}: unexpected_root_schema:${String(document.schema)}`);
    }

    const evidence = document.evidence;
    if (!isObject(evidence)) {
      errors.push(`${name}: evidence_missing`);
      continue;
    }
    if (evidence.schema !== "fh2.pairing-transport-evidence.v1") {
      errors.push(
        `${name}: unexpected_evidence_schema:${String(evidence.schema)}`
      );
    }

    scanSecrets(document, "$", name, errors);

    const events = Array.isArray(evidence.events) ? evidence.events : [];
    if (!Array.isArray(evidence.events)) {
      errors.push(`${name}: evidence_events_missing`);
    }

    const markers = [];
    let connectedCount = 0;

    for (const event of events) {
      if (!isObject(event)) continue;
      if (event.source === "marker" && typeof event.event === "string") {
        markers.push(event.event);
        allMarkers.push(event.event);
        allAcceptanceSignals.push(event.event);
      }
      if (
        event.source === "bridge" &&
        event.event === "heartbeat_established"
      ) {
        allAcceptanceSignals.push(event.event);
      }
      if (
        event.source === "control" &&
        event.event === "state_changed" &&
        event.status === "connected"
      ) {
        connectedCount += 1;
      }
    }

    if (connectedCount >= 2) reconnectObserved = true;

    const bridge = isObject(evidence.bridge) ? evidence.bridge : {};
    if (
      markers.includes("unpair_revocation_accepted") &&
      markers.includes("pairing_cleared_local") &&
      bridge.status === "disconnected"
    ) {
      unpairCompleted = true;
    }

    if (keyManager) {
      const runtime = document.keyManager;
      if (!isObject(runtime)) {
        errors.push(`${name}: keymanager_missing`);
      } else {
        if (runtime.active !== true) {
          errors.push(`${name}: keymanager_not_active`);
        }
        if (runtime.productConnected !== true) {
          errors.push(`${name}: keymanager_product_not_connected`);
        }

        const keys = Array.isArray(runtime.keys) ? runtime.keys : [];
        if (!Array.isArray(runtime.keys) || keys.length === 0) {
          errors.push(`${name}: keymanager_keys_missing`);
        } else {
          keyManagerObserved = true;
          for (const descriptor of keys) {
            if (!isValidKeyDescriptor(descriptor)) {
              errors.push(`${name}: keymanager_descriptor_invalid`);
              continue;
            }
            if (descriptor.runtimeStatus === "supported") {
              keyManagerSupportedObserved = true;
            }
            if (
              descriptor.operations.canSet === true ||
              descriptor.operations.canPerformAction === true
            ) {
              keyManagerWritableMetadataObserved = true;
            }
            if (
              typeof descriptor.cameraLensType === "string" &&
              descriptor.cameraLensType.length > 0
            ) {
              keyManagerLensScopedObserved = true;
            }
          }
        }
      }
    }

    summaries.push({
      name,
      markers,
      connectedCount,
      bridgeStatus:
        typeof bridge.status === "string" ? bridge.status : undefined
    });
  }

  if (acceptance) {
    const requiredSignals = [
      "pairing_accepted",
      "heartbeat_established",
      "stored_pairing_resumed",
      "unpair_revocation_accepted",
      "pairing_cleared_local"
    ];

    for (const signal of requiredSignals) {
      if (!allAcceptanceSignals.includes(signal)) {
        errors.push(`acceptance_missing_marker:${signal}`);
      }
    }

    if (!reconnectObserved) {
      errors.push("acceptance_missing_control_reconnect");
    }
    if (!unpairCompleted) {
      errors.push("acceptance_unpair_not_completed");
    }
  }

  if (keyManager) {
    if (!keyManagerObserved) {
      errors.push("keymanager_acceptance_missing_inventory");
    }
    if (!keyManagerSupportedObserved) {
      errors.push("keymanager_acceptance_missing_supported_key");
    }
    if (!keyManagerWritableMetadataObserved) {
      errors.push("keymanager_acceptance_missing_write_metadata");
    }
    if (!keyManagerLensScopedObserved) {
      errors.push("keymanager_acceptance_missing_lens_scoped_key");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summaries
  };
}

export function loadEvidenceFiles(files) {
  return files.map((file) => ({
    name: file,
    document: JSON.parse(fs.readFileSync(file, "utf8"))
  }));
}

function scanSecrets(value, currentPath, fileName, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanSecrets(item, `${currentPath}[${index}]`, fileName, errors)
    );
    return;
  }

  if (!isObject(value)) {
    if (typeof value === "string" && RAW_BEARER.test(value)) {
      errors.push(`${fileName}: raw_bearer_at:${currentPath}`);
    }
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (FORBIDDEN_KEYS.test(key)) {
      errors.push(`${fileName}: forbidden_key:${childPath}`);
    }
    scanSecrets(item, childPath, fileName, errors);
  }
}

function isValidKeyDescriptor(value) {
  if (!isObject(value)) return false;
  if (typeof value.identifier !== "string" || value.identifier.length === 0) {
    return false;
  }
  if (typeof value.family !== "string" || value.family.length === 0) {
    return false;
  }
  if (!isObject(value.operations)) return false;
  for (const key of [
    "canGet",
    "canSet",
    "canListen",
    "canPerformAction"
  ]) {
    if (typeof value.operations[key] !== "boolean") return false;
  }
  if (
    ![
      "supported",
      "unsupported_on_product",
      "temporarily_unavailable",
      "disconnected",
      "error"
    ].includes(value.runtimeStatus)
  ) {
    return false;
  }
  return typeof value.probeMode === "string" && value.probeMode.length > 0;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printResult(result) {
  for (const summary of result.summaries) {
    const markers = summary.markers.length
      ? summary.markers.join(",")
      : "-";
    console.log(
      `[Evidence] ${summary.name}: bridge=${summary.bridgeStatus ?? "-"} ` +
        `controlConnected=${summary.connectedCount} markers=${markers}`
    );
  }

  if (result.ok) {
    console.log("FH2 MSDK Evidence: OK");
    return;
  }

  console.error("FH2 MSDK Evidence: FEHLER");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
}

function usage() {
  console.error(
    "Usage: node scripts/verify-msdk-evidence.mjs [--acceptance] [--keymanager] <evidence.json> [...]"
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const acceptance = args.includes("--acceptance");
  const keyManager = args.includes("--keymanager");
  const files = args.filter(
    (arg) => arg !== "--acceptance" && arg !== "--keymanager"
  );

  if (files.length === 0) {
    usage();
    process.exitCode = 2;
  } else {
    try {
      const result = validateEvidenceDocuments(
        loadEvidenceFiles(files),
        { acceptance, keyManager }
      );
      printResult(result);
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    }
  }
}
