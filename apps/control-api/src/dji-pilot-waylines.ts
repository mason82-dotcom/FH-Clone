import {
  DjiPilotWaylineCatalogClient,
  toPilotWaylineMissionReference,
  type DjiPilotWaylineListQuery,
  type DjiPilotWaylinePage
} from "@fh-clone/adapter-dji-cloud";

const DJI_PILOT_ORDER_BY = new Set([
  "name asc",
  "name desc",
  "update_time asc",
  "update_time desc",
  "create_time asc",
  "create_time desc"
]);

const DJI_PILOT_TEMPLATE_TYPES = new Set([0, 1, 2, 3]);

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
  const key = optionalString(url, "key");
  const favorited = optionalBoolean(url, "favorited");
  const actionType = optionalInteger(url, "action_type", 1, 1);
  const templateTypes = integerArray(url, "template_type");
  if (templateTypes.some((value) => !DJI_PILOT_TEMPLATE_TYPES.has(value))) {
    throw new Error("invalid_query_template_type");
  }
  const droneModelKeys = nonEmptyArray(url, "drone_model_keys");
  const payloadModelKeys = nonEmptyArray(url, "payload_model_key");
  const orderBy = optionalString(url, "order_by");
  if (orderBy && !DJI_PILOT_ORDER_BY.has(orderBy)) {
    throw new Error("invalid_query_order_by");
  }

  return {
    page: requiredInteger(url, "page", 1, 1, 10_000),
    pageSize: requiredInteger(url, "page_size", 10, 1, 500),
    ...(key ? { key } : {}),
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
  const value = strictInteger(raw, name);
  if (value < min || value > max) {
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
  const value = strictInteger(raw, name);
  if (value < min || value > max) {
    throw new Error(`invalid_query_${name}`);
  }
  return value;
}

function optionalString(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value ? value : undefined;
}

function optionalBoolean(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name)?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`invalid_query_${name}`);
}

function integerArray(url: URL, name: string): number[] {
  return url.searchParams.getAll(name).map((raw) => strictInteger(raw, name));
}

function strictInteger(raw: string, name: string): number {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`invalid_query_${name}`);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`invalid_query_${name}`);
  }
  return value;
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


export function withPilotWaylineMissionReferences(page: DjiPilotWaylinePage) {
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      missionReference: toPilotWaylineMissionReference(item) ?? null
    }))
  };
}
