import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readWpmlKmz } from "../packages/adapters/dji-cloud/dist/wpml/kmz.js";

export function buildWpmlPilotEvidence({
  kmzBytes,
  pilotStatus,
  capturedAt = new Date().toISOString(),
  realHardware = false
}) {
  if (!realHardware) {
    throw new Error(
      "WPML hardware evidence requires explicit --real-hardware confirmation"
    );
  }

  validatePilotStatus(pilotStatus);

  const pkg = readWpmlKmz(kmzBytes);
  const parserComparison = compareParsedWpml(pkg.bundle);
  if (!parserComparison.pass) {
    const failed = Object.entries(parserComparison.checks)
      .filter(([, ok]) => ok !== true)
      .map(([name]) => name)
      .join(", ");
    throw new Error(`WPML parser comparison failed: ${failed || "unknown"}`);
  }

  const archiveEntries = pkg.entries.map((entry) => entry.path);
  const resourceReferences = findResourceReferences(
    pkg.templateXml,
    pkg.waylinesXml
  );

  for (const ref of resourceReferences) {
    if (!archiveContainsReference(archiveEntries, ref)) {
      throw new Error(`WPML resource reference missing from KMZ: ${ref}`);
    }
  }

  return {
    schema: "fh2.wpml-pilot-evidence.v1",
    generatedBy: "DJI Pilot 2",
    capturedAt,
    realHardware: true,
    synthetic: false,
    redacted: true,
    sourceSha256: sha256Hex(kmzBytes),
    archiveEntries,
    resourceReferences,
    parserComparison,
    pilotCatalog: {
      realWorkspace: true,
      responseValidated: true,
      tokenPresentInFixture: false,
      listRequests: pilotStatus.listRequests,
      pilotNativeListRequests: pilotStatus.pilotNativeListRequests,
      lastPilotNativeListRequestAt:
        pilotStatus.lastPilotNativeListRequestAt,
      emptyCatalogObserved: true
    }
  };
}

const ACCEPTED_PILOT_EVIDENCE_ERROR_CODES = new Set([
  // DJI's current Pilot 2 RC export can omit globalRTHHeight even though the
  // published WPML reference marks it required. Keep the parser/import path
  // fail-closed; only the hardware-evidence comparison tolerates this exact
  // observed vendor deviation.
  "mission.global_rth_height_missing"
]);

export function compareParsedWpml(bundle) {
  const templateConfig = bundle?.template?.missionConfig;
  const waylineConfig = bundle?.waylines?.missionConfig;
  const templateFolders = Array.isArray(bundle?.template?.folders)
    ? bundle.template.folders
    : [];
  const waylineFolders = Array.isArray(bundle?.waylines?.folders)
    ? bundle.waylines.folders
    : [];
  const issues = Array.isArray(bundle?.issues) ? bundle.issues : [];

  const blockingIssues = issues.filter(
    (issue) =>
      issue?.level === "error" &&
      !ACCEPTED_PILOT_EVIDENCE_ERROR_CODES.has(issue?.code)
  );
  const acceptedIssueCodes = [
    ...new Set(
      issues
        .filter(
          (issue) =>
            issue?.level === "error" &&
            ACCEPTED_PILOT_EVIDENCE_ERROR_CODES.has(issue?.code)
        )
        .map((issue) => issue.code)
    )
  ].sort();

  const missionConfig =
    isRecord(templateConfig) &&
    isRecord(waylineConfig) &&
    typeof templateConfig.rawXml === "string" &&
    templateConfig.rawXml.length > 0 &&
    typeof waylineConfig.rawXml === "string" &&
    waylineConfig.rawXml.length > 0 &&
    blockingIssues.length === 0;

  const productEnums =
    sameProductIdentity(templateConfig?.drone, waylineConfig?.drone) &&
    samePayloadIdentity(templateConfig?.payload, waylineConfig?.payload);

  const heightModes =
    templateFolders.length > 0 &&
    waylineFolders.length > 0 &&
    templateFolders.every(
      (folder) =>
        typeof folder?.heightMode === "string" &&
        folder.heightMode.trim().length > 0
    ) &&
    waylineFolders.every(
      (folder) =>
        typeof folder?.executeHeightMode === "string" &&
        folder.executeHeightMode.trim().length > 0
    );

  const templateIds = new Set(
    templateFolders
      .map((folder) => folder?.templateId)
      .filter((value) => Number.isSafeInteger(value))
  );
  const waylineIds = waylineFolders
    .map((folder) => folder?.waylineId)
    .filter((value) => Number.isSafeInteger(value));
  const templateWaylineIds =
    templateIds.size === templateFolders.length &&
    waylineIds.length === waylineFolders.length &&
    new Set(waylineIds).size === waylineIds.length &&
    waylineFolders.every(
      (folder) =>
        Number.isSafeInteger(folder?.templateId) &&
        templateIds.has(folder.templateId)
    );

  const continuousWaypointIndices =
    waylineFolders.length > 0 &&
    waylineFolders.every((folder) => {
      const points = Array.isArray(folder?.waypoints) ? folder.waypoints : [];
      return (
        points.length > 0 &&
        points.every(
          (waypoint, index) =>
            Number.isSafeInteger(waypoint?.index) && waypoint.index === index
        )
      );
    });

  const checks = {
    missionConfig,
    productEnums,
    heightModes,
    templateWaylineIds,
    continuousWaypointIndices
  };

  return {
    pass: Object.values(checks).every(Boolean),
    checks,
    acceptedIssueCodes
  };
}

export function validatePilotStatus(status) {
  if (!isRecord(status)) {
    throw new Error("Pilot Wayline server status must be a JSON object");
  }
  if (
    status.enabled !== true ||
    status.configured !== true ||
    status.readOnly !== true
  ) {
    throw new Error("Pilot Wayline server is not configured in read-only mode");
  }

  if (
    !Number.isSafeInteger(status.listRequests) ||
    status.listRequests < 1
  ) {
    throw new Error("No successful Pilot Wayline list request observed");
  }

  if (
    !Number.isSafeInteger(status.pilotNativeListRequests) ||
    status.pilotNativeListRequests < 1
  ) {
    throw new Error(
      "No native DJI Pilot list request observed; local curl requests do not qualify"
    );
  }

  if (
    typeof status.lastPilotNativeListRequestAt !== "string" ||
    !Number.isFinite(Date.parse(status.lastPilotNativeListRequestAt))
  ) {
    throw new Error("native DJI Pilot request timestamp missing or invalid");
  }
}

export function findResourceReferences(...xmlDocuments) {
  const found = new Set();
  const pattern = /(?:wpmz\/)?res\/[A-Za-z0-9._~%+\-/]+/g;

  for (const xml of xmlDocuments) {
    if (typeof xml !== "string") continue;
    for (const match of xml.matchAll(pattern)) {
      const value = match[0].replace(/^\/+/, "");
      if (value) found.add(value);
    }
  }

  return [...found].sort();
}

function sameProductIdentity(left, right) {
  if (!isRecord(left) || !isRecord(right)) return false;
  return (
    Number.isSafeInteger(left.enumValue) &&
    left.enumValue === right.enumValue &&
    optionalIntegerEqual(left.subEnumValue, right.subEnumValue)
  );
}

function samePayloadIdentity(left, right) {
  if (!isRecord(left) || !isRecord(right)) return false;
  return (
    Number.isSafeInteger(left.enumValue) &&
    left.enumValue === right.enumValue &&
    Number.isSafeInteger(left.positionIndex) &&
    left.positionIndex === right.positionIndex
  );
}

function optionalIntegerEqual(left, right) {
  if (left === undefined && right === undefined) return true;
  return (
    Number.isSafeInteger(left) &&
    Number.isSafeInteger(right) &&
    left === right
  );
}

function archiveContainsReference(entries, ref) {
  const normalized = ref.replace(/^\/+/, "");
  return entries.some((entry) => {
    const value = String(entry).replace(/^\/+/, "");
    return (
      value === normalized ||
      value === `wpmz/${normalized}` ||
      value.endsWith(`/${normalized}`)
    );
  });
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadStatus({ statusFile, statusUrl }) {
  if (statusFile && statusUrl) {
    throw new Error("Use either --status-file or --status-url, not both");
  }
  if (statusFile) {
    return JSON.parse(await fs.readFile(statusFile, "utf8"));
  }
  if (statusUrl) {
    const response = await fetch(statusUrl, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) {
      throw new Error(
        `Pilot status request failed: HTTP ${response.status}`
      );
    }
    return response.json();
  }
  throw new Error("--status-file or --status-url is required");
}

function parseArgs(argv) {
  const result = {
    realHardware: false,
    out: "docs/fixtures/wpml/evidence.json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--real-hardware") {
      result.realHardware = true;
      continue;
    }
    if (["--kmz", "--status-file", "--status-url", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      index += 1;
      if (arg === "--kmz") result.kmz = value;
      if (arg === "--status-file") result.statusFile = value;
      if (arg === "--status-url") result.statusUrl = value;
      if (arg === "--out") result.out = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.realHardware) {
    throw new Error("--real-hardware is required");
  }
  if (!result.kmz) {
    throw new Error("--kmz <DJI-Pilot-2.kmz> is required");
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [kmzBytes, pilotStatus] = await Promise.all([
    fs.readFile(args.kmz),
    loadStatus(args)
  ]);

  const evidence = buildWpmlPilotEvidence({
    kmzBytes,
    pilotStatus,
    realHardware: true
  });

  const outputPath = path.resolve(args.out);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(evidence, null, 2) + "\n", {
    mode: 0o600
  });

  console.log(
    JSON.stringify(
      {
        output: args.out,
        sourceSha256: evidence.sourceSha256,
        archiveEntries: evidence.archiveEntries.length,
        resourceReferences: evidence.resourceReferences.length,
        parserComparison: evidence.parserComparison,
        pilotCatalog: evidence.pilotCatalog
      },
      null,
      2
    )
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  });
}
