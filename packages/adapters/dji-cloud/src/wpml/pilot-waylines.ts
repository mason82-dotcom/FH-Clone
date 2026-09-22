import type { MissionExternalReference } from "@fh-clone/aircraft-core";
import {
  type DjiPilotWaylineItem,
  type DjiPilotWaylineListQuery,
  type DjiPilotWaylinePage
} from "./types.js";

export class DjiPilotWaylineCatalogError extends Error {}
export class DjiPilotWaylineCatalogNotConfigured extends DjiPilotWaylineCatalogError {}

export type DjiPilotFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface DjiPilotWaylineCatalogOptions {
  enabled: boolean;
  baseUrl?: string;
  workspaceId?: string;
  authToken?: string;
  timeoutMs?: number;
  fetchImpl?: DjiPilotFetch;
}

export class DjiPilotWaylineCatalogClient {
  private readonly fetchImpl: DjiPilotFetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: DjiPilotWaylineCatalogOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get configured(): boolean {
    return Boolean(
      this.options.enabled &&
      this.options.baseUrl?.trim() &&
      this.options.workspaceId?.trim() &&
      this.options.authToken?.trim()
    );
  }

  status() {
    return {
      enabled: this.options.enabled,
      configured: this.configured,
      readOnly: true
    };
  }

  async listWaylines(query: DjiPilotWaylineListQuery = {}): Promise<DjiPilotWaylinePage> {
    this.requireConfigured();

    const base = this.options.baseUrl!.trim().replace(/\/+$/, "");
    const workspaceId = encodeURIComponent(this.options.workspaceId!.trim());
    const url = new URL(`${base}/wayline/api/v1/workspaces/${workspaceId}/waylines`);

    appendString(url, "key", query.key);
    appendBoolean(url, "favorited", query.favorited);
    appendString(url, "order_by", query.orderBy);
    appendInteger(url, "page", query.page);
    appendInteger(url, "page_size", query.pageSize);
    appendInteger(url, "action_type", query.actionType);
    appendMany(url, "template_type", query.templateTypes);
    appendMany(url, "drone_model_keys", query.droneModelKeys);
    appendMany(url, "payload_model_key", query.payloadModelKeys);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: "application/json",
          "x-auth-token": this.options.authToken!.trim()
        }
      });
    } catch (error) {
      throw new DjiPilotWaylineCatalogError(
        error instanceof Error ? error.name : "DJI Pilot Wayline request failed"
      );
    }

    if (!response.ok) {
      throw new DjiPilotWaylineCatalogError(`DJI Pilot Wayline HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DjiPilotWaylineCatalogError("DJI Pilot Wayline endpoint returned invalid JSON");
    }

    return parseCatalogResponse(payload);
  }

  private requireConfigured(): void {
    if (!this.configured) {
      throw new DjiPilotWaylineCatalogNotConfigured(
        "DJI Pilot Wayline catalog requires base URL, workspace ID and x-auth-token"
      );
    }
  }
}

export function parseCatalogResponse(payload: unknown): DjiPilotWaylinePage {
  if (!isRecord(payload)) throw new DjiPilotWaylineCatalogError("Invalid DJI Pilot Wayline response");

  const code = payload.code;
  if (code !== undefined && code !== null && code !== 0 && code !== "0") {
    throw new DjiPilotWaylineCatalogError(
      typeof payload.message === "string"
        ? payload.message
        : `DJI Pilot Wayline business error ${String(code)}`
    );
  }

  const data = isRecord(payload.data) ? payload.data : undefined;
  const rawList = data?.list;
  const rawPagination = data?.pagination;
  const list: unknown[] = Array.isArray(rawList) ? rawList : [];
  const pagination: Record<string, unknown> = isRecord(rawPagination)
    ? rawPagination
    : {};

  return {
    items: list.filter(isRecord).map(normalizeItem),
    pagination: {
      page: integerOr(pagination.page, 0),
      pageSize: integerOr(pagination.page_size, 0),
      total: integerOr(pagination.total, 0)
    }
  };
}

function normalizeItem(raw: Record<string, unknown>): DjiPilotWaylineItem {
  const start = isRecord(raw.start_wayline_point) ? raw.start_wayline_point : undefined;
  const id = stringValue(raw.id);
  const name = stringValue(raw.name);
  const droneModelKey = stringValue(raw.drone_model_key);
  const userName = stringValue(raw.user_name);
  const latitude = numberValue(start?.start_latitude);
  // DJI's published schema currently spells this field "start_lontitude".
  // Accept a corrected spelling too, but preserve one normalized longitude field.
  const longitude = numberValue(start?.start_lontitude ?? start?.start_longitude);

  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(droneModelKey ? { droneModelKey } : {}),
    payloadModelKeys: stringArray(raw.payload_model_keys),
    templateTypes: integerArray(raw.template_types),
    ...(typeof raw.action_type === "number" && Number.isInteger(raw.action_type)
      ? { actionType: raw.action_type }
      : {}),
    ...(typeof raw.favorited === "boolean" ? { favorited: raw.favorited } : {}),
    ...(typeof raw.update_time === "number" && Number.isFinite(raw.update_time)
      ? { updateTimeMs: raw.update_time }
      : {}),
    ...(userName ? { userName } : {}),
    ...(latitude !== undefined && longitude !== undefined
      ? { startPoint: { latitude, longitude } }
      : {})
  };
}

function appendMany(
  url: URL,
  key: string,
  values: readonly (string | number)[] | undefined
): void {
  if (!values) return;
  for (const value of values) url.searchParams.append(key, String(value));
}

function appendBoolean(url: URL, key: string, value: boolean | undefined): void {
  if (value !== undefined) url.searchParams.set(key, String(value));
}

function appendString(url: URL, key: string, value: string | undefined): void {
  if (value?.trim()) url.searchParams.set(key, value.trim());
}

function appendInteger(url: URL, key: string, value: number | undefined): void {
  if (value !== undefined && Number.isInteger(value)) {
    url.searchParams.set(key, String(value));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function integerArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}


export function toPilotWaylineMissionReference(
  item: DjiPilotWaylineItem
): MissionExternalReference | undefined {
  const id = item.id?.trim();
  if (!id) return undefined;
  return {
    kind: "wayline",
    id,
    source: "dji_pilot_wayline",
    confidence: "authoritative"
  };
}
