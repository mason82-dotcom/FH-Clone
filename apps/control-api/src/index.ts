import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  DeviceRegistry,
  ParameterRegistry
} from "@fh-clone/aircraft-core";
import {
  DjiCloudAdapter,
  type DjiCloudAdapterOptions
} from "@fh-clone/adapter-dji-cloud";
import {
  authorizeDjiGateway,
  type EmqxAuthorizationRequest
} from "./authz.js";

const devices = new DeviceRegistry();
const parameters = new ParameterRegistry();

const djiOptions = getDjiOptions();
const dji = djiOptions ? new DjiCloudAdapter(djiOptions) : undefined;

if (dji) {
  await dji.start({
    onDevice(device) {
      devices.upsert(device);
    },
    onParameter(sample) {
      parameters.update(sample);
    },
    onRawMessage(message) {
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
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/devices") {
      return json(response, 200, devices.list());
    }

    if (request.method === "GET" && url.pathname === "/api/dji/topology") {
      return json(response, 200, dji?.topology.listGateways() ?? []);
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
      const body = await readJson<EmqxAuthorizationRequest>(request, 16_384);
      if (!dji) return json(response, 200, { result: "ignore" });
      const result = authorizeDjiGateway(dji.topology, body);
      return json(response, 200, { result });
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
  publicServer.close();
  internalServer.close();
  await dji?.stop();
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
