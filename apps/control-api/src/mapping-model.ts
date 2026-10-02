import { validateMappingResultPath } from "./mapping-object-store.js";

export const MAPPING_JOB_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "DONE",
  "FAILED"
] as const;

export type MappingJobStatus = typeof MAPPING_JOB_STATUSES[number];

export type MappingProfile = "fast" | "standard" | "high";

export type MappingResultKind =
  | "orthophoto_cog"
  | "dsm_cog"
  | "dtm_cog"
  | "report"
  | "log"
  | "manifest"
  | "other";

export interface MappingJobCreateInput {
  name: string;
  assetIds: string[];
  profile?: MappingProfile;
  odmOptions?: Record<string, string | number | boolean>;
  missionId?: string;
  deviceSn?: string;
}

export interface MappingAgentClaimInput {
  agentId: string;
  leaseSeconds?: number;
  capabilities?: Record<string, unknown>;
}

export interface MappingAgentHeartbeatInput {
  agentId: string;
  progress: number;
  message?: string;
  leaseSeconds?: number;
}

export interface MappingAgentRefInput {
  agentId: string;
}

export interface MappingUploadUrlsInput extends MappingAgentRefInput {
  paths: string[];
}

export interface MappingResultFileInput {
  path: string;
  kind: MappingResultKind;
  sha256?: string;
  size?: number;
}

export interface MappingTileManifest {
  path: string;
  format: "png";
  minzoom: number;
  maxzoom: number;
}

export interface MappingResultManifest {
  crs?: string;
  boundsWgs84?: [number, number, number, number];
  files: MappingResultFileInput[];
  tiles?: MappingTileManifest;
}

export interface MappingCompleteInput extends MappingAgentRefInput {
  manifest: MappingResultManifest;
}

export interface MappingFailInput extends MappingAgentRefInput {
  error: string;
}

export interface MappingJob {
  id: string;
  name: string;
  status: MappingJobStatus;
  assetIds: string[];
  options: Record<string, unknown>;
  missionId?: string;
  deviceSn?: string;
  createdBy: string;
  agentId?: string;
  leaseUntil?: string;
  attempts: number;
  progress: number;
  message?: string;
  error?: string;
  claimedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MappingSourceAsset {
  assetId: string;
  objectKey: string;
  fileName?: string;
}

const AGENT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const RESULT_KINDS = new Set<MappingResultKind>([
  "orthophoto_cog",
  "dsm_cog",
  "dtm_cog",
  "report",
  "log",
  "manifest",
  "other"
]);

export function parseMappingJobCreateInput(value: unknown): MappingJobCreateInput {
  const body = record(value, "mapping_job_body");
  const name = text(body.name, "name", 1, 200);
  const rawAssetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
  if (rawAssetIds.length < 1 || rawAssetIds.length > 2_000) {
    throw new Error("assetIds_must_contain_1_to_2000_items");
  }

  const assetIds = rawAssetIds.map((entry, index) =>
    text(entry, `assetIds[${index}]`, 1, 512)
  );
  if (new Set(assetIds).size !== assetIds.length) {
    throw new Error("assetIds_must_be_unique");
  }

  const profile = body.profile === undefined
    ? "standard"
    : parseProfile(body.profile);

  const odmOptions =
    body.odmOptions === undefined
      ? undefined
      : scalarRecord(body.odmOptions, "odmOptions");

  return {
    name,
    assetIds,
    profile,
    ...(odmOptions ? { odmOptions } : {}),
    ...(body.missionId !== undefined
      ? { missionId: text(body.missionId, "missionId", 1, 256) }
      : {}),
    ...(body.deviceSn !== undefined
      ? { deviceSn: text(body.deviceSn, "deviceSn", 1, 256) }
      : {})
  };
}

export function parseMappingAgentClaimInput(value: unknown): MappingAgentClaimInput {
  const body = record(value, "mapping_agent_claim");
  const agentId = agentIdFrom(body);
  const leaseSeconds = optionalLease(alias(body, "leaseSeconds", "lease_seconds"));
  const capabilitiesValue = body.capabilities;

  return {
    agentId,
    ...(leaseSeconds !== undefined ? { leaseSeconds } : {}),
    ...(capabilitiesValue !== undefined
      ? { capabilities: record(capabilitiesValue, "capabilities") }
      : {})
  };
}

export function parseMappingAgentHeartbeatInput(
  value: unknown
): MappingAgentHeartbeatInput {
  const body = record(value, "mapping_agent_heartbeat");
  const agentId = agentIdFrom(body);
  if (
    typeof body.progress !== "number" ||
    !Number.isFinite(body.progress) ||
    body.progress < 0 ||
    body.progress > 100
  ) {
    throw new Error("progress_must_be_0_to_100");
  }

  const leaseSeconds = optionalLease(alias(body, "leaseSeconds", "lease_seconds"));
  return {
    agentId,
    progress: body.progress,
    ...(body.message !== undefined
      ? { message: text(body.message, "message", 0, 500) }
      : {}),
    ...(leaseSeconds !== undefined ? { leaseSeconds } : {})
  };
}

export function parseMappingAgentRefInput(value: unknown): MappingAgentRefInput {
  const body = record(value, "mapping_agent_ref");
  return { agentId: agentIdFrom(body) };
}

export function parseMappingUploadUrlsInput(value: unknown): MappingUploadUrlsInput {
  const body = record(value, "mapping_upload_urls");
  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  if (rawPaths.length < 1 || rawPaths.length > 1_000) {
    throw new Error("paths_must_contain_1_to_1000_items");
  }
  const paths = rawPaths.map(validateMappingResultPath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("paths_must_be_unique");
  }
  return {
    agentId: agentIdFrom(body),
    paths
  };
}

export function parseMappingCompleteInput(value: unknown): MappingCompleteInput {
  const body = record(value, "mapping_complete");
  const manifestBody = record(body.manifest, "manifest");
  const rawFiles = Array.isArray(manifestBody.files) ? manifestBody.files : [];
  if (rawFiles.length < 1 || rawFiles.length > 500) {
    throw new Error("manifest_files_must_contain_1_to_500_items");
  }

  const files = rawFiles.map((entry, index) => {
    const file = record(entry, `manifest.files[${index}]`);
    const kind = text(file.kind, `manifest.files[${index}].kind`, 1, 32) as MappingResultKind;
    if (!RESULT_KINDS.has(kind)) {
      throw new Error("manifest_file_kind_invalid");
    }

    const sha256 = file.sha256 === undefined
      ? undefined
      : text(file.sha256, `manifest.files[${index}].sha256`, 64, 64).toLowerCase();
    if (sha256 !== undefined && !SHA256_RE.test(sha256)) {
      throw new Error("manifest_file_sha256_invalid");
    }

    const size = file.size === undefined
      ? undefined
      : nonNegativeInteger(file.size, `manifest.files[${index}].size`);

    return {
      path: validateMappingResultPath(file.path),
      kind,
      ...(sha256 !== undefined ? { sha256 } : {}),
      ...(size !== undefined ? { size } : {})
    };
  });

  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error("manifest_file_paths_must_be_unique");
  }

  const crs = manifestBody.crs === undefined
    ? undefined
    : text(manifestBody.crs, "manifest.crs", 1, 64);

  const boundsValue = alias(manifestBody, "boundsWgs84", "bounds_wgs84");
  const boundsWgs84 = boundsValue === undefined
    ? undefined
    : parseBounds(boundsValue);

  const tiles = manifestBody.tiles === undefined
    ? undefined
    : parseTiles(manifestBody.tiles);

  return {
    agentId: agentIdFrom(body),
    manifest: {
      files,
      ...(crs !== undefined ? { crs } : {}),
      ...(boundsWgs84 !== undefined ? { boundsWgs84 } : {}),
      ...(tiles !== undefined ? { tiles } : {})
    }
  };
}

export function parseMappingFailInput(value: unknown): MappingFailInput {
  const body = record(value, "mapping_fail");
  return {
    agentId: agentIdFrom(body),
    error: text(body.error, "error", 1, 2_000)
  };
}

function parseTiles(value: unknown): MappingTileManifest {
  const tiles = record(value, "manifest.tiles");
  const format = text(tiles.format, "manifest.tiles.format", 1, 8);
  if (format !== "png") throw new Error("manifest_tiles_format_invalid");
  const minzoom = integerRange(tiles.minzoom, 0, 24, "manifest.tiles.minzoom");
  const maxzoom = integerRange(tiles.maxzoom, 0, 24, "manifest.tiles.maxzoom");
  if (minzoom > maxzoom) throw new Error("manifest_tiles_zoom_range_invalid");

  return {
    path: validateMappingResultPath(tiles.path),
    format,
    minzoom,
    maxzoom
  };
}

function parseBounds(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("manifest_bounds_invalid");
  }
  const [west, south, east, north] = value;
  if (
    !finiteRange(west, -180, 180) ||
    !finiteRange(east, -180, 180) ||
    !finiteRange(south, -90, 90) ||
    !finiteRange(north, -90, 90) ||
    west >= east ||
    south >= north
  ) {
    throw new Error("manifest_bounds_invalid");
  }
  return [west, south, east, north];
}

function agentIdFrom(body: Record<string, any>): string {
  const value = alias(body, "agentId", "agent_id");
  const agentId = text(value, "agentId", 1, 64);
  if (!AGENT_ID_RE.test(agentId)) throw new Error("invalid_agentId");
  return agentId;
}

function alias(
  body: Record<string, any>,
  camel: string,
  snake: string
): unknown {
  if (body[camel] !== undefined && body[snake] !== undefined) {
    throw new Error(`${camel}_duplicate_alias`);
  }
  return body[camel] ?? body[snake];
}

function optionalLease(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return integerRange(value, 10, 3_600, "leaseSeconds");
}

function parseProfile(value: unknown): MappingProfile {
  if (value === "fast" || value === "standard" || value === "high") {
    return value;
  }
  throw new Error("invalid_mapping_profile");
}

function scalarRecord(
  value: unknown,
  field: string
): Record<string, string | number | boolean> {
  const input = record(value, field);
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(key)) {
      throw new Error(`${field}_invalid_key`);
    }
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      throw new Error(`${field}_values_must_be_scalar`);
    }
    result[key] = entry;
  }
  return result;
}

function record(value: unknown, field: string): Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field}_must_be_object`);
  }
  return value as Record<string, any>;
}

function text(
  value: unknown,
  field: string,
  min: number,
  max: number
): string {
  if (typeof value !== "string") throw new Error(`${field}_must_be_string`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field}_length_invalid`);
  }
  return normalized;
}

function integerRange(
  value: unknown,
  min: number,
  max: number,
  field: string
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field}_out_of_range`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  return integerRange(value, 0, Number.MAX_SAFE_INTEGER, field);
}

function finiteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
