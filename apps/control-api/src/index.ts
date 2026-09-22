import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  DeviceRegistry,
  ParameterRegistry
} from "@fh-clone/aircraft-core";
import {
  DjiCloudAdapter,
  type DjiCloudAdapterOptions,
  type DjiProductRef
} from "@fh-clone/adapter-dji-cloud";
import {
  authorizeEmqx,
  isEmqxAuthorizationRequest
} from "./authz.js";
import { RtkTelemetryService } from "./rtk-service.js";
import { MissionSessionTracker } from "./mission-session.js";
import { MissionStore } from "./mission-store.js";

const devices = new DeviceRegistry();
const parameters = new ParameterRegistry();

const djiOptions = getDjiOptions();
const dji = djiOptions ? new DjiCloudAdapter(djiOptions) : undefined;
const missions = new MissionSessionTracker({
  resolveGatewaySn: (deviceId) => dji?.resolveGatewaySn(deviceId)
});
const missionStore = new MissionStore({
  ...(process.env.TIMESCALE_URL
    ? { connectionString: process.env.TIMESCALE_URL }
    : {}),
  ...(process.env.RTK_SOURCE_LABEL
    ? { rtkSourceLabel: process.env.RTK_SOURCE_LABEL }
    : {}),
  ...(process.env.RTK_SOURCE_PROVIDER
    ? { rtkProvider: process.env.RTK_SOURCE_PROVIDER }
    : {})
});
const rtk = new RtkTelemetryService({
  resolveGatewaySn: (deviceId) => dji?.resolveGatewaySn(deviceId),
  resolveMissionId: (deviceId) => missions.getActive(deviceId)?.missionId
});

if (missionStore.enabled) {
  try {
    const recovered = await missionStore.recoverOpenAutomaticSessions();
    if (recovered > 0) {
      console.warn(
        `[Mission] ${recovered} offene automatische Session(s) nach Service-Neustart geschlossen.`
      );
    }
  } catch (error) {
    console.error(
      "[Mission] Recovery offener Sessions fehlgeschlagen:",
      errorMessage(error)
    );
  }
}

if (dji) {
  await dji.start({
    onDevice(device) {
      devices.upsert(device);
    },
    onParameter(sample) {
      parameters.update(sample);
    },
    async onRawMessage(message) {
      const previousMissionId = message.deviceId
        ? missions.getActive(message.deviceId)?.missionId
        : undefined;
      const session = missions.observe(message);

      if (session && session.endedAt !== undefined) {
        try {
          await missionStore.closeSession(session);
        } catch (error) {
          console.error(
            "[Mission] Failed to persist automatic mission end:",
            session.missionId,
            errorMessage(error)
          );
        }
      } else if (
        session &&
        session.missionId !== previousMissionId
      ) {
        try {
          await missionStore.open(session, {
            ...(message.deviceId
              ? getMissionProduct(message.deviceId)
              : {})
          });
        } catch (error) {
          console.error(
            "[Mission] Failed to persist automatic mission start:",
            session.missionId,
            errorMessage(error)
          );
        }
      }

      rtk.observe(message);
      if (process.env.LOG_RAW_DJI === "1") {
        console.debug("[DJI RAW]", message.channel, message.deviceId ?? "-", message.payload);
      }
    }
  });
}

const publicPort = envInt("PORT", 8080);
const internalPort = envInt("INTERNAL_PORT", 8081);
const bind = process.env.BIND ?? "0.0.0.0";
const internalBind = process.env.INTERNAL_BIND ?? "0.0.0.0";
const emqxAuthzToken = process.env.EMQX_AUTHZ_TOKEN;
const missionSweepTimer = setInterval(() => {
  void persistSweptMissionEnds();
}, 5_000);
missionSweepTimer.unref();

if (!emqxAuthzToken) {
  console.warn(
    "[AuthZ] EMQX_AUTHZ_TOKEN ist nicht gesetzt; dynamische DJI/DRC-Autorisierung bleibt gesperrt."
  );
}

const publicServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        status: "ok",
        service: "control-api",
        dji: {
          enabled: Boolean(dji),
          connected: dji?.isConnected ?? false,
          apiVersion: dji?.apiVersion
        },
        missions: {
          active: missions.listActive().length,
          persistenceEnabled: missionStore.enabled
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/devices") {
      return json(response, 200, devices.list());
    }

    if (request.method === "GET" && url.pathname === "/api/dji/topology") {
      return json(response, 200, dji?.topology.listGateways() ?? []);
    }

    if (request.method === "GET" && url.pathname === "/api/missions/active") {
      return json(response, 200, missions.listActive());
    }

    const missionMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/mission$/);
    if (request.method === "GET" && missionMatch) {
      const deviceId = decodeURIComponent(missionMatch[1] ?? "");
      const active = missions.getActive(deviceId);
      const lastCompleted = missions.getLastCompleted(deviceId);
      return json(response, 200, { deviceId, active, lastCompleted });
    }

    if (request.method === "GET" && url.pathname === "/api/rtk") {
      return json(response, 200, rtk.list());
    }

    if (request.method === "GET" && url.pathname === "/api/events/rtk") {
      const deviceId = url.searchParams.get("device") ?? undefined;
      rtk.openEventStream(response, deviceId);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/rtk/transitions") {
      const deviceId = url.searchParams.get("device") ?? undefined;
      return json(response, 200, rtk.recentTransitions(deviceId));
    }

    const rtkMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/rtk$/);
    if (request.method === "GET" && rtkMatch) {
      const deviceId = decodeURIComponent(rtkMatch[1] ?? "");
      const snapshot = rtk.get(deviceId);
      return snapshot
        ? json(response, 200, snapshot)
        : json(response, 404, { error: "rtk_status_not_available", deviceId });
    }

    const telemetryMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/telemetry$/);
    if (request.method === "GET" && telemetryMatch) {
      const deviceId = decodeURIComponent(telemetryMatch[1] ?? "");
      return json(response, 200, parameters.snapshot(deviceId));
    }

    return json(response, 404, { error: "not_found" });
  } catch (error) {
    return json(response, 500, { error: errorMessage(error) });
  }
});

const internalServer = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { status: "ok", service: "control-api-internal" });
    }

    if (request.method === "POST" && request.url === "/internal/emqx/authz") {
      try {
        const body = await readJson<unknown>(request, 16_384);
        if (!isEmqxAuthorizationRequest(body)) {
          return json(response, 200, { result: "deny" });
        }

        const dynamicRequest =
          body.username.startsWith("dji-gateway-") ||
          (
            body.username === "backend-service" &&
            /\/drc\/(up|down)$/.test(body.topic)
          );

        if (dynamicRequest && !hasValidBearerToken(request, emqxAuthzToken)) {
          auditAuthz("deny", body, "invalid_internal_token");
          return json(response, 200, { result: "deny" });
        }

        if (!dji) {
          const result = dynamicRequest ? "deny" : "ignore";
          auditAuthz(result, body, "dji_adapter_unavailable");
          return json(response, 200, { result });
        }

        const result = await authorizeEmqx(dji.topology, body, {
          // DRC remains fail-closed until the backend DRC session manager is
          // explicitly wired to this policy after FC3/lease/authority checks.
          isDrcGatewayActive: () => false
        });

        if (result === "deny") {
          auditAuthz(result, body, "policy_denied");
        }
        return json(response, 200, { result });
      } catch (error) {
        console.error("[AuthZ] Evaluierungsfehler:", errorMessage(error));
        return json(response, 200, { result: "deny" });
      }
    }

    return json(response, 404, { error: "not_found" });
  } catch (error) {
    return json(response, 400, { result: "deny", error: errorMessage(error) });
  }
});

publicServer.listen(publicPort, bind, () => {
  console.log(`FH-Clone control API listening on ${bind}:${publicPort}`);
});

internalServer.listen(internalPort, internalBind, () => {
  console.log(`FH-Clone internal API listening on ${internalBind}:${internalPort}`);
});

async function shutdown(): Promise<void> {
  clearInterval(missionSweepTimer);
  publicServer.close();
  internalServer.close();
  await dji?.stop();
  await missionStore.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

function getDjiOptions(): DjiCloudAdapterOptions | undefined {
  const brokerUrl = process.env.DJI_MQTT_URL;
  if (!brokerUrl) return undefined;

  return {
    brokerUrl,
    ...(process.env.DJI_MQTT_USERNAME ? { username: process.env.DJI_MQTT_USERNAME } : {}),
    ...(process.env.DJI_MQTT_PASSWORD ? { password: process.env.DJI_MQTT_PASSWORD } : {}),
    clientId: process.env.DJI_MQTT_CLIENT_ID ?? "fh-clone-backend",
    ...(process.env.DJI_CLOUD_API_VERSION ? { apiVersion: process.env.DJI_CLOUD_API_VERSION } : {})
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body));
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-length", encoded.length);
  response.end(encoded);
}

async function readJson<T>(request: IncomingMessage, limit: number): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("request_body_too_large");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


function hasValidBearerToken(
  request: IncomingMessage,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) return false;

  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return false;
  }

  const presented = header.slice("Bearer ".length);
  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(presented);

  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual)
  );
}

function auditAuthz(
  result: "allow" | "deny" | "ignore",
  request: {
    username: string;
    clientid: string;
    action: string;
    topic: string;
    peerhost?: string;
  },
  reason: string
): void {
  console.info("[AuthZ]", {
    result,
    reason,
    username: request.username,
    clientid: request.clientid,
    action: request.action,
    topic: request.topic,
    ...(request.peerhost ? { peerhost: request.peerhost } : {})
  });
}


async function persistSweptMissionEnds(): Promise<void> {
  const ended = missions.sweep();
  for (const session of ended) {
    try {
      await missionStore.closeSession(session);
    } catch (error) {
      console.error(
        "[Mission] Failed to persist automatic mission end:",
        session.missionId,
        errorMessage(error)
      );
    }
  }
}

function getMissionProduct(
  deviceId: string
): { product: DjiProductRef } | Record<string, never> {
  const gatewaySn = dji?.resolveGatewaySn(deviceId);
  if (!gatewaySn) return {};

  const topology = dji?.topology.getGateway(gatewaySn);
  const product = topology?.subDevices.find(
    (device) => device.sn === deviceId
  )?.product;

  return product ? { product } : {};
}
