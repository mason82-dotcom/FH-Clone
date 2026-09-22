import type { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

export interface EmqxAuthorizationRequest {
  username: string;
  clientid: string;
  action: "publish" | "subscribe" | string;
  topic: string;
  qos?: string | number;
  peerhost?: string;
}

export type EmqxAuthorizationResult = "allow" | "deny" | "ignore";

export interface EmqxAuthorizationPolicy {
  /**
   * Dynamic DRC gate. This must represent an active FH-Clone DRC session
   * (FC3 + control lease + DJI authority), not merely an active mission.
   */
  isDrcGatewayActive?: (gatewaySn: string) => boolean;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_GATEWAY_USERNAME = /^dji-gateway-[A-Za-z0-9_-]+$/;

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

export function authorizeEmqx(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): EmqxAuthorizationResult {
  if (request.username.startsWith("dji-gateway-")) {
    return authorizeDjiGateway(topology, request, policy);
  }

  if (request.username === "backend-service") {
    return authorizeBackendDrc(topology, request, policy);
  }

  // All other identities intentionally fall through to the static file ACL.
  // In particular, webui-operator remains read-only there.
  return "ignore";
}

export function authorizeDjiGateway(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy = {}
): EmqxAuthorizationResult {
  if (!request.username.startsWith("dji-gateway-")) return "ignore";
  if (!SAFE_GATEWAY_USERNAME.test(request.username)) return "deny";
  if (!SAFE_ID.test(request.clientid)) return "deny";
  if (request.username !== `dji-gateway-${request.clientid}`) return "deny";

  const parsed = splitProductTopic(request.topic);
  if (!parsed) return "deny";

  if (request.action === "publish") {
    if (
      (parsed.family === "sys" || parsed.family === "thing") &&
      parsed.sn === request.clientid &&
      parsed.suffix === "status"
    ) {
      // Bootstrap path: update_topo must be possible before sub-devices are known.
      return "allow";
    }

    if (
      parsed.family === "thing" &&
      parsed.sn === request.clientid &&
      [
        "osd",
        "state",
        "events",
        "requests",
        "services_reply"
      ].includes(parsed.suffix)
    ) {
      return "allow";
    }

    if (
      parsed.family === "thing" &&
      parsed.sn === request.clientid &&
      parsed.suffix === "drc/up"
    ) {
      return policy.isDrcGatewayActive?.(request.clientid) ? "allow" : "deny";
    }

    if (
      parsed.family === "thing" &&
      topology.isDeviceBehindGateway(request.clientid, parsed.sn) &&
      ["osd", "state"].includes(parsed.suffix)
    ) {
      return "allow";
    }

    return "deny";
  }

  if (request.action === "subscribe") {
    if (parsed.sn !== request.clientid) return "deny";

    if (
      parsed.family === "thing" &&
      [
        "services",
        "property/set",
        "events_reply",
        "requests_reply"
      ].includes(parsed.suffix)
    ) {
      return "allow";
    }

    if (
      parsed.family === "thing" &&
      parsed.suffix === "drc/down"
    ) {
      return policy.isDrcGatewayActive?.(request.clientid) ? "allow" : "deny";
    }

    if (
      parsed.family === "sys" &&
      parsed.suffix === "status_reply"
    ) {
      return "allow";
    }

    return "deny";
  }

  return "deny";
}

function authorizeBackendDrc(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest,
  policy: EmqxAuthorizationPolicy
): EmqxAuthorizationResult {
  const parsed = splitProductTopic(request.topic);
  if (!parsed || parsed.family !== "thing") return "ignore";

  const isKnownGateway = Boolean(topology.getGateway(parsed.sn));
  const drcActive =
    isKnownGateway &&
    (policy.isDrcGatewayActive?.(parsed.sn) ?? false);

  if (request.action === "publish" && parsed.suffix === "drc/down") {
    return drcActive ? "allow" : "deny";
  }

  if (request.action === "subscribe" && parsed.suffix === "drc/up") {
    return drcActive ? "allow" : "deny";
  }

  // Non-DRC backend permissions remain in the file ACL.
  return "ignore";
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

  return true;
}
