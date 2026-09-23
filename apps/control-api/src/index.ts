import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  DeviceRegistry,
  ParameterRegistry
} from "@fh-clone/aircraft-core";
import {
  DjiCloudAdapter,
  DrcSessionManager,
  InMemoryDrcSessionStore,
  isDjiM3mMediaInput,
  normalizeDjiM3mMediaMetadata,
  type DjiCloudAdapterOptions,
  type DjiProductRef
} from "@fh-clone/adapter-dji-cloud";
import {
  HttpUgcsBridgeTransport,
  UgcsAdapter
} from "@fh-clone/adapter-ugcs";
import {
  MediaOverlayRegistry,
  isMediaAsset
} from "./media-overlay.js";
import {
  evaluateEmqxAuthorization,
  isEmqxAuthorizationRequest
} from "./authz.js";
import { AuthzAuditWriter } from "./authz-audit.js";
import {
  authenticateEmqx,
  isEmqxAuthenticationRequest,
  PostgresGatewayCredentialStore
} from "./authn.js";
import { RtkTelemetryService } from "./rtk-service.js";
import { MissionSessionTracker } from "./mission-session.js";
import { MissionStore } from "./mission-store.js";
import { createFh2OpenApiFromEnv, Fh2OpenApiError, Fh2OpenApiNotConfigured } from "./fh2-openapi.js";
import { PostgresGatewayRegistryStore } from "./topology-store.js";
import { RuntimeControlGuardRegistry, resolveRuntimeDrcGuards } from "./control-guards.js";

const devices = new DeviceRegistry();
const parameters = new ParameterRegistry();
const fh2 = createFh2OpenApiFromEnv();
const ugcs = createUgcsFromEnv();
const mediaOverlays = new MediaOverlayRegistry();

const topologyStore = await createTopologyStore();
const topologyPersistence = createTopologyPersistenceQueue(topologyStore);
const gatewayCredentials = await createGatewayCredentialStore();
let drcSessions: DrcSessionManager | undefined;
const djiOptions = getDjiOptions(topologyPersistence, async (gatewaySn, drcState) => {
  await drcSessions?.applyDrcStatus(gatewaySn, drcState);
}, async (reason) => {
  const open = await drcSessions?.listOpenSessions() ?? [];
  await Promise.allSettled(open.map((session) => drcSessions?.markTransportLost(session.gatewaySn, reason)));
});
const dji = djiOptions ? new DjiCloudAdapter(djiOptions) : undefined;
const controlGuards = new RuntimeControlGuardRegistry();
const drcRuntimeContext = new Map<
  string,
  { sessionId: string; aircraftSn: string; state: string }
>();
drcSessions = dji
  ? new DrcSessionManager(dji.drc, new InMemoryDrcSessionStore(), {
      onStateChange(record) {
        if (record.state === "closed" || record.state === "idle") {
          drcRuntimeContext.delete(record.gatewaySn);
          return;
        }
        drcRuntimeContext.set(record.gatewaySn, {
          sessionId: record.sessionId,
          aircraftSn: record.aircraftSn,
          state: record.state
        });
      },
      onAudit: (event) => console.info("[DRC]", event)
    })
  : undefined;
function getDrcGuards(aircraftSn: string, holder?: string) {
  return resolveRuntimeDrcGuards({
    hasFc3: (sn) => controlGuards.hasFc3(sn),
    hasLease: (sn, leaseHolder) => controlGuards.hasLease(sn, leaseHolder),
    supportsFlightControl: (sn) => dji?.supportsFlightControl(sn) ?? false,
    isCloudControlAuthorized: (sn) => dji?.isCloudControlAuthorized(sn) ?? false
  }, aircraftSn, holder);
}

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
const authzAudit = new AuthzAuditWriter({
  ...(process.env.TIMESCALE_URL
    ? { connectionString: process.env.TIMESCALE_URL }
    : {})
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

const publicPort = envInt("PORT", 8080);
const internalPort = envInt("INTERNAL_PORT", 8081);
const bind = process.env.BIND ?? "0.0.0.0";
const internalBind = process.env.INTERNAL_BIND ?? "0.0.0.0";
const emqxAuthnToken = process.env.EMQX_AUTHN_TOKEN;
const emqxAuthzToken = process.env.EMQX_AUTHZ_TOKEN;
const mediaIngestToken = process.env.MEDIA_INGEST_TOKEN;
const missionSweepTimer = setInterval(() => {
  void persistSweptMissionEnds();
}, 5_000);
missionSweepTimer.unref();

if (!emqxAuthnToken) {
  console.warn(
    "[AuthN] EMQX_AUTHN_TOKEN ist nicht gesetzt; MQTT-Authentifizierung über den internen Hook bleibt gesperrt."
  );
}

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
        },
        ugcs: {
          configured: Boolean(ugcs)
        },
        mediaOverlays: {
          assets: mediaOverlays.size()
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const [
        topologyStoreReady,
        gatewayCredentialStoreReady,
        missionStoreReady
      ] = await Promise.all([
        topologyStore
          ? topologyStore.assertReady().then(() => true).catch(() => false)
          : Promise.resolve(false),
        gatewayCredentials
          ? gatewayCredentials.assertReady().then(() => true).catch(() => false)
          : Promise.resolve(false),
        missionStore.ping()
      ]);

      const checks = {
        mqttBackendConnected: dji?.isConnected ?? false,
        topologyStoreReady,
        gatewayCredentialStoreReady,
        missionStoreReady
      };
      const ready = Object.values(checks).every(Boolean);
      return json(response, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        service: "control-api",
        checks
      });
    }

    if (request.method === "GET" && url.pathname === "/api/devices") {
      return json(response, 200, devices.list());
    }

    if (request.method === "GET" && url.pathname === "/api/dji/topology") {
      return json(response, 200, dji?.topology.listGateways() ?? []);
    }

    if (request.method === "GET" && url.pathname === "/api/dji/topology/persisted") {
      if (!topologyStore) return json(response, 503, { error: "topology_persistence_disabled" });
      return json(response, 200, await topologyStore.list());
    }

    const authorityMatch = url.pathname.match(
      /^\/api\/dji\/gateways\/([^/]+)\/authority$/
    );
    if (request.method === "GET" && authorityMatch) {
      const gatewaySn = decodeURIComponent(authorityMatch[1] ?? "");
      if (!dji) return json(response, 503, { error: "dji_not_configured" });
      const state = dji.getCloudControlAuthority(gatewaySn);
      return json(response, 200, {
        gatewaySn,
        cloudControlEnabled: true,
        state: state ?? {
          gatewaySn,
          status: "unknown",
          authorized: false,
          updatedAt: null,
          source: "local"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/missions/active") {
      return json(response, 200, missions.listActive());
    }

    if (request.method === "GET" && url.pathname === "/api/fh2/status") {
      return json(response, 200, fh2.status());
    }

    if (request.method === "GET" && url.pathname === "/api/fh2/waylines") {
      try {
        const page = queryInt(url, "page", 1, 1, 10_000);
        const size = queryInt(url, "size", 100, 1, 500);
        return json(response, 200, await fh2.listWaylines(page, size));
      } catch (error) {
        if (error instanceof Fh2OpenApiNotConfigured) {
          return json(response, 503, { error: "fh2_not_configured" });
        }
        throw error;
      }
    }

    if (request.method === "GET" && url.pathname === "/api/fh2/flight-tasks") {
      try {
        const page = queryInt(url, "page", 1, 1, 10_000);
        const pageSize = queryInt(url, "page_size", 50, 1, 500);
        return json(response, 200, await fh2.listFlightTasks(page, pageSize));
      } catch (error) {
        if (error instanceof Fh2OpenApiNotConfigured) {
          return json(response, 503, { error: "fh2_not_configured" });
        }
        throw error;
      }
    }


    if (request.method === "GET" && url.pathname === "/api/ugcs/status") {
      if (!ugcs) return json(response, 503, { error: "ugcs_not_configured" });
      try {
        return json(response, 200, await ugcs.health());
      } catch (error) {
        return json(response, 502, {
          error: "ugcs_bridge_unavailable",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ugcs/vehicles") {
      if (!ugcs) return json(response, 503, { error: "ugcs_not_configured" });
      try {
        return json(response, 200, await ugcs.listVehicles());
      } catch (error) {
        return json(response, 502, {
          error: "ugcs_bridge_unavailable",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ugcs/routes") {
      if (!ugcs) return json(response, 503, { error: "ugcs_not_configured" });
      try {
        return json(response, 200, await ugcs.listRoutes());
      } catch (error) {
        return json(response, 502, {
          error: "ugcs_bridge_unavailable",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/ugcs/telemetry") {
      if (!ugcs) return json(response, 503, { error: "ugcs_not_configured" });
      try {
        return json(response, 200, await ugcs.readTelemetrySnapshot());
      } catch (error) {
        return json(response, 502, {
          error: "ugcs_bridge_unavailable",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/media/overlays") {
      return json(response, 200, mediaOverlays.list());
    }

    const missionMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/mission$/);
    if (request.method === "GET" && missionMatch) {
      const deviceId = decodeURIComponent(missionMatch[1] ?? "");
      const active = missions.getActive(deviceId);
      const lastCompleted = missions.getLastCompleted(deviceId);
      return json(response, 200, { deviceId, active, lastCompleted });
    }

    const capabilitiesMatch = url.pathname.match(
      /^\/api\/devices\/([^/]+)\/capabilities$/
    );
    if (request.method === "GET" && capabilitiesMatch) {
      const deviceId = decodeURIComponent(capabilitiesMatch[1] ?? "");
      return json(response, 200, getDeviceCapabilityView(deviceId));
    }

    const waylineMatch = url.pathname.match(
      /^\/api\/devices\/([^/]+)\/wayline$/
    );
    if (request.method === "GET" && waylineMatch) {
      const deviceId = decodeURIComponent(waylineMatch[1] ?? "");
      return json(response, 200, getWaylineObservation(deviceId));
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
    const message = errorMessage(error);
    if (message.startsWith("invalid_query_")) {
      return json(response, 400, { error: message });
    }
    if (error instanceof Fh2OpenApiError) {
      return json(response, 502, { error: "fh2_upstream_error" });
    }
    return json(response, 500, { error: message });
  }
});

const internalServer = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { status: "ok", service: "control-api-internal" });
    }

    if (request.method === "POST" && request.url === "/internal/emqx/authn") {
      try {
        const body = await readJson<unknown>(request, 16_384);
        if (
          !isEmqxAuthenticationRequest(body) ||
          !hasValidBearerToken(request, emqxAuthnToken)
        ) {
          return json(response, 200, {
            result: "deny",
            is_superuser: false
          });
        }

        const result = await authenticateEmqx(
          gatewayCredentials,
          body,
          process.env.DJI_MQTT_PASSWORD
        );

        console.info("[AuthN]", {
          result: result.result,
          username: body.username,
          clientid: body.clientid,
          ...(body.peerhost ? { peerhost: body.peerhost } : {}),
          ...(result.result === "allow"
            ? { gateway_sn: result.client_attrs.gateway_sn }
            : {})
        });

        return json(response, 200, result);
      } catch (error) {
        console.error("[AuthN] Evaluierungsfehler:", errorMessage(error));
        return json(response, 200, {
          result: "deny",
          is_superuser: false
        });
      }
    }

    if (request.method === "POST" && request.url === "/internal/media/dji-m3m") {
      try {
        if (!hasValidBearerToken(request, mediaIngestToken)) {
          return json(response, 401, { error: "media_ingest_unauthorized" });
        }

        const body = await readJson<unknown>(request, 2_000_000);
        if (!isDjiM3mMediaInput(body)) {
          return json(response, 400, { error: "invalid_m3m_media_input" });
        }

        const normalized = normalizeDjiM3mMediaMetadata(body);
        const overlay = mediaOverlays.upsert(normalized.asset);

        return json(response, 200, {
          asset: normalized.asset,
          captureUuid: normalized.captureUuid ?? null,
          conflicts: normalized.conflicts,
          radiometry: normalized.radiometry,
          sourceKeys: normalized.sourceKeys,
          overlayed: Boolean(overlay)
        });
      } catch (error) {
        return json(response, 400, {
          error: "m3m_media_normalization_failed",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "POST" && request.url === "/internal/media/assets") {
      try {
        if (!hasValidBearerToken(request, mediaIngestToken)) {
          return json(response, 401, { error: "media_ingest_unauthorized" });
        }

        const body = await readJson<unknown>(request, 2_000_000);
        const candidates = Array.isArray(body) ? body : [body];

        if (candidates.length === 0 || candidates.length > 500) {
          return json(response, 400, { error: "invalid_media_asset_batch" });
        }

        const assets = candidates.filter(isMediaAsset);
        if (assets.length !== candidates.length) {
          return json(response, 400, { error: "invalid_media_asset" });
        }

        let overlayed = 0;
        for (const asset of assets) {
          if (mediaOverlays.upsert(asset)) overlayed += 1;
        }

        return json(response, 200, {
          accepted: assets.length,
          overlayed
        });
      } catch (error) {
        return json(response, 400, {
          error: "media_ingest_failed",
          detail: errorMessage(error)
        });
      }
    }

    if (request.method === "POST" && request.url === "/internal/emqx/authz") {
      const startedAt = process.hrtime.bigint();
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
          enqueueAuthzAudit(
            body,
            { result: "deny", reason: "internal_error" },
            elapsedUs(startedAt)
          );
          return json(response, 200, { result: "deny" });
        }

        if (!dji) {
          const result = dynamicRequest ? "deny" : "ignore";
          enqueueAuthzAudit(
            body,
            { result, reason: "internal_error" },
            elapsedUs(startedAt)
          );
          return json(response, 200, { result });
        }

        const authzDecision = await evaluateEmqxAuthorization(dji.topology, body, {
          isGatewayPrincipalActive: async (username, gatewaySn) =>
            (await gatewayCredentials?.isActiveBinding(username, gatewaySn)) ?? false,
          // Runtime-only session state. It is intentionally never rehydrated
          // from PostgreSQL after a process restart.
          isDrcGatewayActive: async (gatewaySn) => {
            const session = await drcSessions?.get(gatewaySn);
            if (!session || !(await drcSessions?.isActive(gatewaySn))) return false;
            const guards = getDrcGuards(session.aircraftSn, session.holder);
            return guards.fc3 && guards.controlLease && guards.capability && guards.djiAuthority;
          }
        });

        enqueueAuthzAudit(body, authzDecision, elapsedUs(startedAt));
        return json(response, 200, { result: authzDecision.result });
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

await listenServer(publicServer, publicPort, bind);
console.log(`FH-Clone control API listening on ${bind}:${publicPort}`);

await listenServer(internalServer, internalPort, internalBind);
console.log(`FH-Clone internal API listening on ${internalBind}:${internalPort}`);

if (ugcs) {
  try {
    await ugcs.start();
    console.log("FH-Clone UgCS adapter connected.");
  } catch (error) {
    console.warn(
      "[UgCS] Bridge nicht erreichbar; Groundstation bleibt read-only offline:",
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


async function shutdown(): Promise<void> {
  clearInterval(missionSweepTimer);
  publicServer.close();
  internalServer.close();
  await drcSessions?.shutdown();
  await dji?.stop();
  await ugcs?.stop();
  await authzAudit.shutdown();
  await gatewayCredentials?.close();
  await missionStore.close();
  await topologyPersistence.flush();
  await topologyStore?.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

function getDjiOptions(
  topologyPersistence: TopologyPersistenceQueue,
  onDrcStatus: NonNullable<DjiCloudAdapterOptions["onDrcStatus"]>,
  onDrcTransportLost: NonNullable<DjiCloudAdapterOptions["onDrcTransportLost"]>
): DjiCloudAdapterOptions | undefined {
  const brokerUrl = process.env.DJI_MQTT_URL;
  if (!brokerUrl) return undefined;

  return {
    brokerUrl,
    ...(process.env.DJI_MQTT_USERNAME ? { username: process.env.DJI_MQTT_USERNAME } : {}),
    ...(process.env.DJI_MQTT_PASSWORD ? { password: process.env.DJI_MQTT_PASSWORD } : {}),
    clientId: process.env.DJI_MQTT_CLIENT_ID ?? "fh-clone-backend",
    onDrcStatus,
    onDrcTransportLost,
    ...(process.env.DJI_CLOUD_API_VERSION ? { apiVersion: process.env.DJI_CLOUD_API_VERSION } : {}),
    ...(topologyPersistence.enabled ? { onTopologyChange: (change: import("@fh-clone/adapter-dji-cloud").TopologyChange) => topologyPersistence.enqueue(change) } : {})
  };
}

function listenServer(
  server: Server,
  port: number,
  host: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
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

function queryInt(
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

function enqueueAuthzAudit(
  request: {
    username: string;
    clientid: string;
    action: string;
    topic: string;
    qos?: string | number;
    peerhost?: string;
  },
  decision: {
    result: "allow" | "deny" | "ignore";
    reason: import("./authz.js").AuthzReason;
    gatewaySn?: string;
    aircraftSn?: string;
  },
  latencyUs: number
): void {
  const runtimeDrc = decision.gatewaySn
    ? drcRuntimeContext.get(decision.gatewaySn)
    : undefined;
  const aircraftSn = decision.aircraftSn ?? runtimeDrc?.aircraftSn;
  const missionId = aircraftSn
    ? missions.getActive(aircraftSn)?.missionId
    : undefined;

  authzAudit.enqueue({
    timeMs: Date.now(),
    decision: decision.result,
    reason: decision.reason,
    action: request.action,
    topic: request.topic,
    ...(request.qos !== undefined ? { qos: request.qos } : {}),
    username: request.username,
    clientId: request.clientid,
    ...(request.peerhost ? { peerIp: request.peerhost } : {}),
    ...(decision.gatewaySn ? { gatewaySn: decision.gatewaySn } : {}),
    ...(aircraftSn ? { aircraftSn } : {}),
    ...(runtimeDrc?.sessionId ? { drcSessionId: runtimeDrc.sessionId } : {}),
    ...(missionId ? { missionId } : {}),
    cacheHit: false,
    latencyUs
  });
}

function elapsedUs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1000n);
}

function getDeviceCapabilityView(deviceId: string) {
  const adapterDevices = devices.get(deviceId);
  const djiDevice = adapterDevices.find((device) => device.adapterId === "dji-cloud");
  const adapterCapabilities = djiDevice?.capabilities ?? [];
  const controlProfile = dji?.getControlProfile(deviceId);
  const activeMission = missions.getActive(deviceId);
  const lastCompletedMission = missions.getLastCompleted(deviceId);

  return {
    deviceId,
    adapters: adapterDevices.map((device) => ({
      adapterId: device.adapterId,
      connected: device.connected,
      lastSeenAt: device.lastSeenAt,
      capabilities: device.capabilities
    })),
    djiCloud: {
      controlProfile: controlProfile ?? null,
      genericAdapterCapabilities: adapterCapabilities,
      specializedRuntime: controlProfile
        ? {
            cloudControl: controlProfile.cloudControl,
            flightControl: controlProfile.flightControl,
            stickControl: controlProfile.stickControl,
            droneControl: controlProfile.droneControl,
            flyTo: controlProfile.flyTo,
            pointingFlight: controlProfile.pointingFlight,
            orbitFlight: controlProfile.orbitFlight,
            payloadControl: controlProfile.payloadControl,
            drcProfile: controlProfile.drcProfile,
            requiresCloudControlAuthority:
              controlProfile.requiresCloudControlAuthority
          }
        : null,
      platform: {
        fh2Read: fh2.status()
      },
      wayline: {
        observedInActiveMission: activeMission?.waylineObserved ?? false,
        observedInLastCompletedMission:
          lastCompletedMission?.waylineObserved ?? false,
        currentlyFlyingWayline: activeMission?.lastModeCode === 5,
        executionCapabilityAdvertised:
          adapterCapabilities.includes("mission.wayline"),
        managementImplemented:
          adapterCapabilities.includes("mission.wayline")
      }
    }
  };
}

function getWaylineObservation(deviceId: string) {
  const activeMission = missions.getActive(deviceId);
  const lastCompletedMission = missions.getLastCompleted(deviceId);
  const adapterCapabilities = devices
    .get(deviceId)
    .flatMap((device) => device.capabilities);

  return {
    deviceId,
    source: "dji_mode_code",
    currentlyFlyingWayline: activeMission?.lastModeCode === 5,
    observedInActiveMission: activeMission?.waylineObserved ?? false,
    ...(activeMission ? { activeMissionId: activeMission.missionId } : {}),
    ...(lastCompletedMission?.waylineObserved
      ? { lastCompletedWaylineMissionId: lastCompletedMission.missionId }
      : {}),
    waylineId: null,
    executionCapabilityAdvertised:
      adapterCapabilities.includes("mission.wayline"),
    managementImplemented:
      adapterCapabilities.includes("mission.wayline"),
    note:
      "mode_code=5 is telemetry evidence of a Wayline flight; it does not prove that FH2 can manage, upload or execute Waylines."
  };
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


async function createGatewayCredentialStore(): Promise<
  PostgresGatewayCredentialStore | undefined
> {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.TIMESCALE_URL;
  if (!connectionString) return undefined;

  const store = new PostgresGatewayCredentialStore(connectionString);
  try {
    await store.assertReady();
    return store;
  } catch (error) {
    console.error(
      "[AuthN] Gateway-Credential-Store nicht verfügbar; Gateway-Authentifizierung bleibt gesperrt:",
      errorMessage(error)
    );
    await store.close();
    return undefined;
  }
}

async function createTopologyStore(): Promise<PostgresGatewayRegistryStore | undefined> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return undefined;
  const store = new PostgresGatewayRegistryStore(connectionString);
  try {
    await store.assertReady();
    return store;
  } catch (error) {
    console.error("[Topology] PostgreSQL registry unavailable; inventory persistence disabled:", errorMessage(error));
    await store.close();
    return undefined;
  }
}


type TopologyChange = import("@fh-clone/adapter-dji-cloud").TopologyChange;
type TopologyPersistenceQueue = {
  enabled: boolean;
  enqueue(change: TopologyChange): void;
  flush(): Promise<void>;
};

function createTopologyPersistenceQueue(
  store: PostgresGatewayRegistryStore | undefined
): TopologyPersistenceQueue {
  let tail = Promise.resolve();
  return {
    enabled: Boolean(store),
    enqueue(change) {
      if (!store) return;
      tail = tail
        .then(() => store.save(change))
        .catch((error) => {
          console.error("[Topology] Inventory persistence failed:", errorMessage(error));
        });
    },
    async flush() {
      await tail;
    }
  };
}


function createUgcsFromEnv(): UgcsAdapter | undefined {
  const baseUrl = process.env.UGCS_BRIDGE_URL?.trim();
  if (!baseUrl) return undefined;

  return new UgcsAdapter(
    new HttpUgcsBridgeTransport({
      baseUrl,
      requestTimeoutMs: envInt("UGCS_BRIDGE_TIMEOUT_MS", 5_000)
    })
  );
}
