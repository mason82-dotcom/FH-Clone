#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_SCHEMA = "fh2.msdk.v1";
const EVIDENCE_SCHEMA = "fh2.pairing-transport-evidence.v1";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`${name}_must_be_boolean`);
  }
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name}_must_be_non_empty_string`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function sanitizeDescriptor(entry, index) {
  if (!isObject(entry)) {
    throw new Error(`keyManager.keys[${index}]_must_be_object`);
  }
  if (!isObject(entry.operations)) {
    throw new Error(`keyManager.keys[${index}].operations_missing`);
  }

  return cleanObject({
    identifier: requireString(
      entry.identifier,
      `keyManager.keys[${index}].identifier`
    ),
    family: requireString(
      entry.family,
      `keyManager.keys[${index}].family`
    ),
    componentIndex: optionalString(entry.componentIndex),
    cameraLensType: optionalString(entry.cameraLensType),
    subComponentType: optionalString(entry.subComponentType),
    operations: {
      canGet: requireBoolean(
        entry.operations.canGet,
        `keyManager.keys[${index}].operations.canGet`
      ),
      canSet: requireBoolean(
        entry.operations.canSet,
        `keyManager.keys[${index}].operations.canSet`
      ),
      canListen: requireBoolean(
        entry.operations.canListen,
        `keyManager.keys[${index}].operations.canListen`
      ),
      canPerformAction: requireBoolean(
        entry.operations.canPerformAction,
        `keyManager.keys[${index}].operations.canPerformAction`
      )
    },
    isEvent:
      typeof entry.isEvent === "boolean" ? entry.isEvent : undefined,
    valueType: optionalString(entry.valueType),
    concreteKeyType: optionalString(entry.concreteKeyType),
    probeMode: requireString(
      entry.probeMode,
      `keyManager.keys[${index}].probeMode`
    ),
    runtimeStatus: requireString(
      entry.runtimeStatus,
      `keyManager.keys[${index}].runtimeStatus`
    ),
    lastObservedAt: optionalNumber(entry.lastObservedAt)
  });
}

function sanitizeEvidenceEvents(events) {
  if (!Array.isArray(events)) {
    throw new Error("evidence.events_missing");
  }

  return events
    .filter(isObject)
    .map((event) =>
      cleanObject({
        atMs: optionalNumber(event.atMs),
        source: optionalString(event.source),
        event: optionalString(event.event),
        status: optionalString(event.status)
      })
    )
    .filter(
      (event) =>
        typeof event.source === "string" &&
        typeof event.event === "string"
    );
}

export function redactMsdkEvidenceDocument(
  document,
  { realHardware = false, sourceSha256 } = {}
) {
  if (!realHardware) {
    throw new Error(
      "real_hardware_confirmation_required_use_--real-hardware"
    );
  }
  if (!isObject(document) || document.schema !== ROOT_SCHEMA) {
    throw new Error("unexpected_root_schema");
  }
  if (!isObject(document.keyManager)) {
    throw new Error("keyManager_missing");
  }
  if (!Array.isArray(document.keyManager.keys) ||
      document.keyManager.keys.length === 0) {
    throw new Error("keyManager.keys_missing");
  }
  if (!isObject(document.evidence) ||
      document.evidence.schema !== EVIDENCE_SCHEMA) {
    throw new Error("unexpected_evidence_schema");
  }
  if (
    typeof sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sourceSha256)
  ) {
    throw new Error("source_sha256_required");
  }

  const keyManager = {
    active: requireBoolean(document.keyManager.active, "keyManager.active"),
    productConnected: requireBoolean(
      document.keyManager.productConnected,
      "keyManager.productConnected"
    ),
    probedAt: optionalNumber(document.keyManager.probedAt) ?? null,
    keys: document.keyManager.keys.map(sanitizeDescriptor)
  };

  const bridge = isObject(document.evidence.bridge)
    ? cleanObject({ status: optionalString(document.evidence.bridge.status) })
    : {};
  const controlChannel = isObject(document.evidence.controlChannel)
    ? cleanObject({
        status: optionalString(document.evidence.controlChannel.status)
      })
    : {};

  return cleanObject({
    schema: ROOT_SCHEMA,
    realHardware: true,
    synthetic: false,
    redacted: true,
    timestampMs: optionalNumber(document.timestampMs),
    hardwareProfile: cleanObject({
      productType: optionalString(document.aircraft?.productType),
      msdkRegistered:
        typeof document.sdk?.registered === "boolean"
          ? document.sdk.registered
          : undefined,
      productConnected:
        typeof document.sdk?.productConnected === "boolean"
          ? document.sdk.productConnected
          : undefined
    }),
    provenance: {
      captureKind: "android-msdk-v5-runtime",
      sourceSha256: sourceSha256.toLowerCase(),
      identifiers: "removed",
      coordinates: "removed",
      credentials: "not-exported"
    },
    keyManager,
    evidence: {
      schema: EVIDENCE_SCHEMA,
      capturedAtMs:
        optionalNumber(document.evidence.capturedAtMs) ??
        optionalNumber(document.timestampMs) ??
        null,
      bridge,
      controlChannel,
      events: sanitizeEvidenceEvents(document.evidence.events)
    }
  });
}

function usage() {
  console.error(
    "Usage: node scripts/redact-msdk-evidence.mjs --real-hardware <input.json> [output.json]"
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const realHardware = args.includes("--real-hardware");
  const files = args.filter((arg) => arg !== "--real-hardware");

  if (!realHardware || files.length < 1 || files.length > 2) {
    usage();
    process.exitCode = 2;
  } else {
    try {
      const inputPath = path.resolve(files[0]);
      const outputPath = path.resolve(
        files[1] ?? "docs/fixtures/msdk/keymanager-evidence.json"
      );
      const sourceBytes = fs.readFileSync(inputPath);
      const sourceSha256 = crypto
        .createHash("sha256")
        .update(sourceBytes)
        .digest("hex");
      const document = JSON.parse(sourceBytes.toString("utf8"));
      const redacted = redactMsdkEvidenceDocument(document, {
        realHardware,
        sourceSha256
      });

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(
        outputPath,
        JSON.stringify(redacted, null, 2) + "\n",
        "utf8"
      );

      console.log("MSDK_EVIDENCE_REDACTION=OK");
      console.log(`OUTPUT=${outputPath}`);
      console.log(`SOURCE_SHA256=${sourceSha256}`);
      console.log(`KEY_COUNT=${redacted.keyManager.keys.length}`);
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    }
  }
}
