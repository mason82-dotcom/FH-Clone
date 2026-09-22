import { randomUUID } from "node:crypto";

export class Fh2OpenApiError extends Error {}
export class Fh2OpenApiNotConfigured extends Fh2OpenApiError {}

export type Fh2Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface Fh2OpenApiOptions {
  enabled: boolean;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  userToken?: string;
  timeoutMs?: number;
  fetchImpl?: Fh2Fetch;
}

export class Fh2OpenApiClient {
  private readonly fetchImpl: Fh2Fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: Fh2OpenApiOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  get baseConfigured(): boolean {
    return Boolean(
      this.enabled &&
      this.options.baseUrl?.trim() &&
      this.options.userToken?.trim()
    );
  }

  get organizationConfigured(): boolean {
    return Boolean(this.baseConfigured && this.options.organizationId?.trim());
  }

  get projectConfigured(): boolean {
    return Boolean(this.baseConfigured && this.options.projectId?.trim());
  }

  status() {
    return {
      enabled: this.enabled,
      baseConfigured: this.baseConfigured,
      organizationConfigured: this.organizationConfigured,
      projectConfigured: this.projectConfigured,
      readOnly: true
    };
  }

  async listWaylines(page = 1, pageSize = 100): Promise<unknown> {
    this.requireProject();
    return this.get(
      `/openapi/v2.0/wayline/api/v1/workspaces/${encodeURIComponent(this.options.projectId!.trim())}/web-waylines`,
      { page, size: pageSize }
    );
  }

  async listFlightTasks(page = 1, pageSize = 50): Promise<unknown> {
    this.requireProject();
    return this.get(
      `/openapi/v2.0/task/api/v2/workspaces/${encodeURIComponent(this.options.projectId!.trim())}/flight-tasks`,
      { page, page_size: pageSize }
    );
  }

  async listDevices(
    deviceModelClass = "drone",
    page = 1,
    pageSize = 100
  ): Promise<unknown> {
    this.requireOrganization();
    const classes =
      deviceModelClass === "airport"
        ? ["airport", "base_station"]
        : [deviceModelClass];
    const params = new URLSearchParams();
    for (const value of classes) params.append("device_model_class", value);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return this.get(
      `/openapi/v2.0/manage/api/v1/organizations/${encodeURIComponent(this.options.organizationId!.trim())}/manage-devices`,
      params
    );
  }

  private async get(
    path: string,
    params: URLSearchParams | Record<string, string | number>
  ): Promise<unknown> {
    this.requireBase();
    const baseUrl = this.options.baseUrl!.trim().replace(/\/+$/, "");
    const url = new URL(`${baseUrl}${path}`);
    if (params instanceof URLSearchParams) {
      for (const [key, value] of params.entries()) url.searchParams.append(key, value);
    } else {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: this.headers()
      });
    } catch (error) {
      throw new Fh2OpenApiError(
        error instanceof Error ? error.name : "FH2 request failed"
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Fh2OpenApiError(`FH2 OpenAPI HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Fh2OpenApiError("FH2 OpenAPI returned invalid JSON");
    }

    if (isRecord(payload)) {
      const code = payload.code;
      if (code !== undefined && code !== null && code !== 0 && code !== "0") {
        throw new Fh2OpenApiError(
          typeof payload.message === "string"
            ? payload.message
            : `FH2 OpenAPI business error ${String(code)}`
        );
      }
      if ("data" in payload) return payload.data;
    }

    return payload;
  }

  private headers(): Record<string, string> {
    this.requireBase();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-User-Token": this.options.userToken!.trim(),
      "X-Request-Id": randomUUID(),
      "X-Language": "en"
    };
    if (this.options.projectId?.trim()) {
      headers["X-Project-Uuid"] = this.options.projectId.trim();
    }
    return headers;
  }

  private requireBase(): void {
    if (!this.baseConfigured) {
      throw new Fh2OpenApiNotConfigured(
        "FH2 OpenAPI requires FH2_BASE_URL and FH2_USER_TOKEN"
      );
    }
  }

  private requireOrganization(): void {
    if (!this.organizationConfigured) {
      throw new Fh2OpenApiNotConfigured("FH2_ORG_ID is not configured");
    }
  }

  private requireProject(): void {
    if (!this.projectConfigured) {
      throw new Fh2OpenApiNotConfigured("FH2_PROJECT_ID is not configured");
    }
  }
}

export function createFh2OpenApiFromEnv(): Fh2OpenApiClient {
  return new Fh2OpenApiClient({
    enabled: envBool("FH2_ENABLED", false),
    ...(process.env.FH2_BASE_URL ? { baseUrl: process.env.FH2_BASE_URL } : {}),
    ...(process.env.FH2_ORG_ID ? { organizationId: process.env.FH2_ORG_ID } : {}),
    ...(process.env.FH2_PROJECT_ID ? { projectId: process.env.FH2_PROJECT_ID } : {}),
    ...(process.env.FH2_USER_TOKEN ? { userToken: process.env.FH2_USER_TOKEN } : {}),
    timeoutMs: envInt("FH2_TIMEOUT_MS", 15_000)
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
