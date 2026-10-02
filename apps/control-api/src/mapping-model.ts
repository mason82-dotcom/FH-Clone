export const MAPPING_JOB_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "DONE",
  "FAILED"
] as const;

export type MappingJobStatus = typeof MAPPING_JOB_STATUSES[number];

export type MappingProfile = "fast" | "standard" | "high";

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
  const agentId = text(body.agentId, "agentId", 1, 64);
  if (!AGENT_ID_RE.test(agentId)) throw new Error("invalid_agentId");

  const leaseSeconds = optionalLease(body.leaseSeconds);
  return {
    agentId,
    ...(leaseSeconds !== undefined ? { leaseSeconds } : {}),
    ...(body.capabilities !== undefined
      ? { capabilities: record(body.capabilities, "capabilities") }
      : {})
  };
}

export function parseMappingAgentHeartbeatInput(
  value: unknown
): MappingAgentHeartbeatInput {
  const body = record(value, "mapping_agent_heartbeat");
  const agentId = text(body.agentId, "agentId", 1, 64);
  if (!AGENT_ID_RE.test(agentId)) throw new Error("invalid_agentId");
  if (
    typeof body.progress !== "number" ||
    !Number.isFinite(body.progress) ||
    body.progress < 0 ||
    body.progress > 100
  ) {
    throw new Error("progress_must_be_0_to_100");
  }

  const leaseSeconds = optionalLease(body.leaseSeconds);
  return {
    agentId,
    progress: body.progress,
    ...(body.message !== undefined
      ? { message: text(body.message, "message", 0, 500) }
      : {}),
    ...(leaseSeconds !== undefined ? { leaseSeconds } : {})
  };
}

function optionalLease(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 10 || (value as number) > 3_600) {
    throw new Error("leaseSeconds_must_be_10_to_3600");
  }
  return value as number;
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
