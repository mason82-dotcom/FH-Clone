import {
  DjiPilotWaylineCatalogClient,
  type DjiPilotWaylineListQuery
} from "@fh-clone/adapter-dji-cloud";

export function createDjiPilotWaylineCatalogFromEnv(): DjiPilotWaylineCatalogClient {
  return new DjiPilotWaylineCatalogClient({
    enabled: envBool("DJI_PILOT_WAYLINE_ENABLED", false),
    ...(process.env.DJI_PILOT_BASE_URL
      ? { baseUrl: process.env.DJI_PILOT_BASE_URL }
      : {}),
    ...(process.env.DJI_PILOT_WORKSPACE_ID
      ? { workspaceId: process.env.DJI_PILOT_WORKSPACE_ID }
      : {}),
    ...(process.env.DJI_PILOT_AUTH_TOKEN
      ? { authToken: process.env.DJI_PILOT_AUTH_TOKEN }
      : {}),
    timeoutMs: envInt("DJI_PILOT_TIMEOUT_MS", 15_000)
  });
}

export function parseDjiPilotWaylineListQuery(url: URL): DjiPilotWaylineListQuery {
  const favorited = optionalBoolean(url, "favorited");
  const actionType = optionalInteger(url, "action_type", 0, 1000);
  const templateTypes = integerArray(url, "template_type");
  const droneModelKeys = nonEmptyArray(url, "drone_model_keys");
  const payloadModelKeys = nonEmptyArray(url, "payload_model_key");
  const orderBy = url.searchParams.get("order_by")?.trim();

  return {
    page: requiredInteger(url, "page", 1, 1, 10_000),
    pageSize: requiredInteger(url, "page_size", 100, 1, 500),
    ...(favorited !== undefined ? { favorited } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(actionType !== undefined ? { actionType } : {}),
    ...(templateTypes.length > 0 ? { templateTypes } : {}),
    ...(droneModelKeys.length > 0 ? { droneModelKeys } : {}),
    ...(payloadModelKeys.length > 0 ? { payloadModelKeys } : {})
  };
}

function requiredInteger(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid_query_${name}`);
  }
  return value;
}

function optionalInteger(
  url: URL,
  name: string,
  min: number,
  max: number
): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid_query_${name}`);
  }
  return value;
}

function optionalBoolean(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name)?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`invalid_query_${name}`);
}

function integerArray(url: URL, name: string): number[] {
  return url.searchParams.getAll(name).map((raw) => {
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value)) throw new Error(`invalid_query_${name}`);
    return value;
  });
}

function nonEmptyArray(url: URL, name: string): string[] {
  return url.searchParams
    .getAll(name)
    .map((value) => value.trim())
    .filter(Boolean);
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
