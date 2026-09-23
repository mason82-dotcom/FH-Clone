import type { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

export interface EmqxAuthorizationRequest {
  username: string;
  clientid: string;
  action: "publish" | "subscribe" | string;
  topic: string;
  qos?: string | number;
  peerhost?: string;
  role?: string;
  gateway_sn?: string;
}

export type EmqxAuthorizationResult = "allow" | "deny" | "ignore";

export const AUTHZ_REASONS = [
  "no_match",
  "gateway_own_topic",
  "gateway_topology_mismatch",
  "webui_read_only",
  "webui_topic_out_of_scope",
  "drc_session_active",
  "drc_session_inactive",
  "drc_backend_publish",
  "internal_error"
] as const;

export type AuthzReason = (typeof AUTHZ_REASONS)[number];

export interface EmqxAuthorizationDecision {
  result: EmqxAuthorizationResult;
  reason: AuthzReason;
  gatewaySn?: string;
  aircraftSn?: string;
}

export interface EmqxAuthorizationPolicy {
  /**
   * Credential validity may be checked against the credential store.
   * This is identity validation only; gateway↔aircraft topology remains
   * runtime-only in DjiTopologyRegistry.
   */
  isGatewayPrincipalActive?: (
    username: string,
    gatewaySn: string
  ) => boolean | Promise<boolean>;

  /**
   * Runtime-only DRC gate from the current process lifetime.
   * Never rehydrate this state from PostgreSQL inventory or mission storage.
   */
  isDrcGatewayActive?: (gatewaySn: string) => boolean | Promise<boolean>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function decision(
  result: EmqxAuthorizationResult,
  reason: AuthzReason,
  context: Pick<EmqxAuthorizationDecision, "gatewaySn" | "aircraftSn"> = {}
): EmqxAuthorizationDecision {
  return { result, reason, ...context };
}

function splitProductTopic(topic: string): {
  family: "thing" | "sys";
  sn: string;
  suffix: string;
} | undefined {
  const parts = topic.split("/");
  if (parts.length < 4 || parts[1] !== "product") return undefined;
  if (parts[0] !== "thing" && parts[0] !== "sys") return undefined;
  return {
    family: parts[0],
    sn: parts[2] ?? "",
    suffix: parts.slice(3).join("/")
  };
}

function isWebUiReadTopic(topic: string): boolean {
  const parsed = splitProductTopic(topic);
  if (!parsed) return false;
  if (parsed.family === "sys") return parsed.suffix === "status";
  return ["osd", "state", "events", "requests", "services_reply"].includes(
    parsed.suffix
  );
}

export async function evaluateEmqxAuthorization(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): Promise<EmqxAuthorizationDecision> {
  if (request.role === "dji_gateway") {
    return evaluateDjiGatewayAuthorization(topology, request, policy);
  }

  // A gateway-looking username without trusted AuthN attributes must never
  // regain dynamic rights from username/clientid alone.
  if (request.username.startsWith("dji-gateway-")) {
    return decision("deny", "no_match");
  }

  if (request.username === "backend-service") {
    if (request.role !== "backend_service") {
      return decision("deny", "no_match");
    }
    return evaluateBackendDrc(topology, request, policy);
  }

  if (request.username === "webui-operator") {
    if (request.action === "publish") {
      return decision("deny", "webui_read_only");
    }
    if (request.action === "subscribe" && isWebUiReadTopic(request.topic)) {
      // The static file ACL remains the source granting the read-only role.
      return decision("ignore", "webui_read_only");
    }
    return decision("deny", "webui_topic_out_of_scope");
  }

  return decision("ignore", "no_match");
}

export async function authorizeEmqx(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): Promise<EmqxAuthorizationResult> {
  return (await evaluateEmqxAuthorization(topology, request, policy)).result;
}

export async function evaluateDjiGatewayAuthorization(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): Promise<EmqxAuthorizationDecision> {
  if (request.role !== "dji_gateway") {
    return decision("deny", "no_match");
  }

  const gatewaySn = request.gateway_sn;
  if (!gatewaySn || !SAFE_ID.test(gatewaySn)) {
    return decision("deny", "no_match");
  }

  const principalActive =
    (await policy.isGatewayPrincipalActive?.(request.username, gatewaySn)) ??
    false;
  if (!principalActive) {
    return decision("deny", "no_match", { gatewaySn });
  }

  const parsed = splitProductTopic(request.topic);
  if (!parsed) return decision("deny", "no_match", { gatewaySn });

  const gatewayContext = { gatewaySn };

  if (request.action === "publish") {
    if (
      parsed.family === "thing" &&
      parsed.sn === gatewaySn &&
      parsed.suffix === "drc/up"
    ) {
      const active =
        (await policy.isDrcGatewayActive?.(gatewaySn)) ?? false;
      return active
        ? decision("allow", "drc_session_active", gatewayContext)
        : decision("deny", "drc_session_inactive", gatewayContext);
    }

    if (
      parsed.family === "sys" &&
      parsed.sn === gatewaySn &&
      parsed.suffix === "status"
    ) {
      return decision("allow", "gateway_own_topic", gatewayContext);
    }

    if (
      parsed.family === "thing" &&
      parsed.sn === gatewaySn &&
      ["osd", "state", "events", "requests", "services_reply"].includes(
        parsed.suffix
      )
    ) {
      return decision("allow", "gateway_own_topic", gatewayContext);
    }

    if (
      parsed.family === "thing" &&
      ["osd", "state"].includes(parsed.suffix)
    ) {
      if (topology.isDeviceBehindGateway(gatewaySn, parsed.sn)) {
        return decision("allow", "gateway_own_topic", {
          gatewaySn,
          aircraftSn: parsed.sn
        });
      }
      return decision("deny", "gateway_topology_mismatch", {
        gatewaySn,
        aircraftSn: parsed.sn
      });
    }

    return decision("deny", "no_match", gatewayContext);
  }

  if (request.action === "subscribe") {
    if (parsed.sn !== gatewaySn) {
      return decision("deny", "gateway_topology_mismatch", gatewayContext);
    }

    if (parsed.family === "thing" && parsed.suffix === "drc/down") {
      const active =
        (await policy.isDrcGatewayActive?.(gatewaySn)) ?? false;
      return active
        ? decision("allow", "drc_session_active", gatewayContext)
        : decision("deny", "drc_session_inactive", gatewayContext);
    }

    if (
      parsed.family === "thing" &&
      ["services", "property/set", "events_reply", "requests_reply"].includes(
        parsed.suffix
      )
    ) {
      return decision("allow", "gateway_own_topic", gatewayContext);
    }

    if (parsed.family === "sys" && parsed.suffix === "status_reply") {
      return decision("allow", "gateway_own_topic", gatewayContext);
    }

    return decision("deny", "no_match", gatewayContext);
  }

  return decision("deny", "no_match", gatewayContext);
}

export async function authorizeDjiGateway(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): Promise<EmqxAuthorizationResult> {
  return (
    await evaluateDjiGatewayAuthorization(topology, request, policy)
  ).result;
}

async function evaluateBackendDrc(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy
): Promise<EmqxAuthorizationDecision> {
  const parsed = splitProductTopic(request.topic);
  if (!parsed || parsed.family !== "thing") {
    return decision("ignore", "no_match");
  }

  const gatewayContext = { gatewaySn: parsed.sn };
  const isKnownGateway = Boolean(topology.getGateway(parsed.sn));
  const drcActive =
    isKnownGateway &&
    ((await policy.isDrcGatewayActive?.(parsed.sn)) ?? false);

  if (request.action === "publish" && parsed.suffix === "drc/down") {
    return drcActive
      ? decision("allow", "drc_backend_publish", gatewayContext)
      : decision("deny", "drc_session_inactive", gatewayContext);
  }

  if (request.action === "subscribe" && parsed.suffix === "drc/up") {
    return drcActive
      ? decision("allow", "drc_session_active", gatewayContext)
      : decision("deny", "drc_session_inactive", gatewayContext);
  }

  return decision("ignore", "no_match");
}

export function isEmqxAuthorizationRequest(
  value: unknown
): value is EmqxAuthorizationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;
  if (typeof request.username !== "string") return false;
  if (typeof request.clientid !== "string") return false;
  if (request.action !== "publish" && request.action !== "subscribe") {
    return false;
  }
  if (typeof request.topic !== "string" || request.topic.length === 0) {
    return false;
  }
  if (
    request.qos !== undefined &&
    typeof request.qos !== "string" &&
    typeof request.qos !== "number"
  ) {
    return false;
  }
  if (
    request.peerhost !== undefined &&
    typeof request.peerhost !== "string"
  ) {
    return false;
  }
  if (request.role !== undefined && typeof request.role !== "string") {
    return false;
  }
  if (
    request.gateway_sn !== undefined &&
    typeof request.gateway_sn !== "string"
  ) {
    return false;
  }

  return true;
}
