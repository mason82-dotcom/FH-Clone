import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Real RC Pro Enterprise + DJI Pilot 2 qualification on 2026-09-30 observed
 * the native Wayline HTTP client as exactly okhttp/3.14.9.
 *
 * Keep this fail-closed. A changed Pilot/firmware client signature requires a
 * new real-hardware observation instead of silently broadening the classifier.
 */
const QUALIFIED_NATIVE_PILOT_USER_AGENT = /^okhttp\/3\.14\.9$/i;

export interface PilotWaylineServerOptions {
  enabled: boolean;
  workspaceId?: string;
  authToken?: string;
}

export interface PilotWaylineServerStatus {
  enabled: boolean;
  configured: boolean;
  readOnly: true;
  workspaceConfigured: boolean;
  authConfigured: boolean;
  listRequests: number;
  lastListRequestAt?: string;
  pilotNativeListRequests?: number;
  lastPilotNativeListRequestAt?: string;
  duplicateNameRequests?: number;
  lastDuplicateNameRequestAt?: string;
}

export class PilotWaylineServer {
  private readonly workspaceId: string;
  private readonly authToken: string;
  private listRequests = 0;
  private lastListRequestAt: string | undefined;
  private pilotNativeListRequests = 0;
  private lastPilotNativeListRequestAt: string | undefined;
  private duplicateNameRequests = 0;
  private lastDuplicateNameRequestAt: string | undefined;

  constructor(private readonly options: PilotWaylineServerOptions) {
    this.workspaceId = options.workspaceId?.trim() ?? "";
    this.authToken = options.authToken ?? "";
  }

  get configured(): boolean {
    return Boolean(
      this.options.enabled &&
      UUID_PATTERN.test(this.workspaceId) &&
      this.authToken.length > 0
    );
  }

  status(): PilotWaylineServerStatus {
    return {
      enabled: this.options.enabled,
      configured: this.configured,
      readOnly: true,
      workspaceConfigured: UUID_PATTERN.test(this.workspaceId),
      authConfigured: this.authToken.length > 0,
      listRequests: this.listRequests,
      ...(this.lastListRequestAt
        ? { lastListRequestAt: this.lastListRequestAt }
        : {}),
      ...(this.pilotNativeListRequests > 0
        ? { pilotNativeListRequests: this.pilotNativeListRequests }
        : {}),
      ...(this.lastPilotNativeListRequestAt
        ? { lastPilotNativeListRequestAt: this.lastPilotNativeListRequestAt }
        : {}),
      ...(this.duplicateNameRequests > 0
        ? { duplicateNameRequests: this.duplicateNameRequests }
        : {}),
      ...(this.lastDuplicateNameRequestAt
        ? { lastDuplicateNameRequestAt: this.lastDuplicateNameRequestAt }
        : {})
    };
  }

  matchWorkspace(pathname: string): string | undefined {
    return matchWorkspacePath(
      pathname,
      /^\/wayline\/api\/v1\/workspaces\/([^/]+)\/waylines$/
    );
  }

  matchDuplicateNamesWorkspace(pathname: string): string | undefined {
    return matchWorkspacePath(
      pathname,
      /^\/wayline\/api\/v1\/workspaces\/([^/]+)\/waylines\/duplicate-names$/
    );
  }

  workspaceMatches(workspaceId: string): boolean {
    return this.configured && workspaceId === this.workspaceId;
  }

  authenticate(headers: IncomingHttpHeaders): boolean {
    if (!this.configured) return false;
    const raw = headers["x-auth-token"];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (typeof presented !== "string") return false;

    const expectedBuffer = Buffer.from(this.authToken);
    const presentedBuffer = Buffer.from(presented);

    return (
      expectedBuffer.length === presentedBuffer.length &&
      timingSafeEqual(expectedBuffer, presentedBuffer)
    );
  }

  list(
    url: URL,
    nowMs = Date.now(),
    headers?: Pick<IncomingHttpHeaders, "user-agent">
  ) {
    if (!this.configured) {
      throw new Error("pilot_wayline_server_not_configured");
    }

    const page = strictInteger(url.searchParams.get("page"), 1, 1, 10_000, "page");
    const pageSize = strictInteger(
      url.searchParams.get("page_size"),
      10,
      1,
      500,
      "page_size"
    );

    this.listRequests += 1;
    this.lastListRequestAt = new Date(nowMs).toISOString();

    if (isQualifiedNativePilotRequest(url, headers)) {
      this.pilotNativeListRequests += 1;
      this.lastPilotNativeListRequestAt = this.lastListRequestAt;
    }

    return {
      code: 0,
      message: "success",
      data: {
        list: [],
        pagination: {
          page,
          page_size: pageSize,
          total: 0
        }
      }
    };
  }

  duplicateNames(
    url: URL,
    nowMs = Date.now()
  ) {
    if (!this.configured) {
      throw new Error("pilot_wayline_server_not_configured");
    }

    const names = url.searchParams
      .getAll("name")
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      throw new Error("invalid_query_name");
    }

    this.duplicateNameRequests += 1;
    this.lastDuplicateNameRequestAt = new Date(nowMs).toISOString();

    // The self-hosted server intentionally exposes an empty read-only catalog,
    // therefore none of the requested names can collide with a cloud entry.
    return {
      code: 0,
      message: "success",
      data: []
    };
  }
}

export function isQualifiedNativePilotRequest(
  url: URL,
  headers?: Pick<IncomingHttpHeaders, "user-agent">
): boolean {
  const raw = headers?.["user-agent"];
  const userAgent = Array.isArray(raw) ? raw[0] : raw;
  return (
    typeof userAgent === "string" &&
    QUALIFIED_NATIVE_PILOT_USER_AGENT.test(userAgent.trim()) &&
    url.searchParams.get("file_type") === "5"
  );
}

export function createPilotWaylineServerFromEnv(): PilotWaylineServer {
  return new PilotWaylineServer({
    enabled: envBool("DJI_PILOT_WAYLINE_SERVER_ENABLED", false),
    ...(process.env.DJI_PILOT_WORKSPACE_ID
      ? { workspaceId: process.env.DJI_PILOT_WORKSPACE_ID }
      : {}),
    ...(process.env.DJI_PILOT_WAYLINE_SERVER_AUTH_TOKEN
      ? { authToken: process.env.DJI_PILOT_WAYLINE_SERVER_AUTH_TOKEN }
      : {})
  });
}

function matchWorkspacePath(
  pathname: string,
  pattern: RegExp
): string | undefined {
  const match = pathname.match(pattern);
  if (!match?.[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function strictInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string
): number {
  if (raw === null || raw === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`invalid_query_${name}`);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`invalid_query_${name}`);
  }
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}
