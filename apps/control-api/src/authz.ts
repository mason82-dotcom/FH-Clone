import type { DjiTopologyRegistry } from "@fh-clone/adapter-dji-cloud";

export interface EmqxAuthorizationRequest {
  username: string;
  clientid: string;
  action: "publish" | "subscribe" | string;
  topic: string;
  qos?: string | number;
}

export type EmqxAuthorizationResult = "allow" | "deny" | "ignore";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

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

export function authorizeDjiGateway(
  topology: DjiTopologyRegistry,
  request: EmqxAuthorizationRequest
): EmqxAuthorizationResult {
  if (!request.username.startsWith("dji-gateway-")) return "ignore";
  if (!SAFE_ID.test(request.clientid)) return "deny";

  const parsed = splitProductTopic(request.topic);
  if (!parsed) return "deny";

  if (request.action === "publish") {
    if (
      parsed.family === "sys" &&
      parsed.sn === request.clientid &&
      parsed.suffix === "status"
    ) {
      // Bootstrap path: update_topo must be allowed before any sub-device is known.
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
        "services_reply",
        "drc/up"
      ].includes(parsed.suffix)
    ) {
      return "allow";
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
        "requests_reply",
        "drc/down"
      ].includes(parsed.suffix)
    ) {
      return "allow";
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
