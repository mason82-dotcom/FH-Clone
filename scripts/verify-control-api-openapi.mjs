import fs from "node:fs";

const source = fs.readFileSync("apps/control-api/src/index.ts", "utf8");
const wsSource = fs.readFileSync("apps/control-api/src/msdk-control-ws.ts", "utf8");
const spec = JSON.parse(
  fs.readFileSync("docs/openapi/control-api.openapi.json", "utf8")
);

if (spec.openapi !== "3.1.0") {
  throw new Error(`Unexpected OpenAPI version: ${String(spec.openapi)}`);
}
if (!spec.paths || typeof spec.paths !== "object") {
  throw new Error("OpenAPI paths missing");
}

const publicStart = source.indexOf("const publicServer = createServer");
const internalStart = source.indexOf("const internalServer = createServer");
if (publicStart < 0 || internalStart < 0 || internalStart <= publicStart) {
  throw new Error("Could not isolate public Control API server");
}
const publicSource = source.slice(publicStart, internalStart);

const runtime = new Set();
for (const match of publicSource.matchAll(
  /request\.method === "([A-Z]+)"\s*&&\s*url\.pathname === "([^"]+)"/g
)) {
  runtime.add(`${match[1]} ${match[2]}`);
}

const dynamic = [
  {
    name: "authorityMatch",
    method: "GET",
    path: "/api/dji/gateways/{gateway_sn}/authority"
  },
  {
    name: "missionMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/mission"
  },
  {
    name: "capabilitiesMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/capabilities"
  },
  {
    name: "waylineMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/wayline"
  },
  {
    name: "rtkMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/rtk"
  },
  {
    name: "telemetrySourcesMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/telemetry/sources"
  },
  {
    name: "telemetryMatch",
    method: "GET",
    path: "/api/devices/{device_sn}/telemetry"
  }
];

for (const route of dynamic) {
  if (!publicSource.includes(`const ${route.name} = url.pathname.match`)) {
    throw new Error(`Dynamic route matcher missing: ${route.name}`);
  }
  const methodPattern = new RegExp(
    `request\\.method === "${route.method}"\\s*&&\\s*${route.name}`
  );
  if (!methodPattern.test(publicSource)) {
    throw new Error(
      `Dynamic route method binding missing: ${route.method} ${route.path}`
    );
  }
  runtime.add(`${route.method} ${route.path}`);
}

if (!publicSource.includes("pilotWaylineServer.matchWorkspace")) {
  throw new Error("Pilot Wayline workspace matcher missing");
}
runtime.add("GET /wayline/api/v1/workspaces/{workspace_id}/waylines");

const documented = new Set();
for (const [path, pathItem] of Object.entries(spec.paths)) {
  if (!pathItem || typeof pathItem !== "object") {
    throw new Error(`Invalid path item: ${path}`);
  }
  for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
    if (pathItem[method]) {
      documented.add(`${method.toUpperCase()} ${path}`);
      if (!pathItem[method].operationId) {
        throw new Error(`operationId missing: ${method.toUpperCase()} ${path}`);
      }
      if (!pathItem[method].responses) {
        throw new Error(`responses missing: ${method.toUpperCase()} ${path}`);
      }
    }
  }
}

const missing = [...runtime].filter((route) => !documented.has(route)).sort();
const stale = [...documented].filter((route) => !runtime.has(route)).sort();

if (missing.length || stale.length) {
  console.error("OpenAPI/runtime drift detected");
  if (missing.length) console.error("Missing in OpenAPI:", missing);
  if (stale.length) console.error("Not implemented in public runtime:", stale);
  process.exit(1);
}

const wsEndpoints = spec["x-fh2-websocket-endpoints"];
if (!Array.isArray(wsEndpoints)) {
  throw new Error("x-fh2-websocket-endpoints missing");
}
const msdkWs = wsEndpoints.find(
  (entry) => entry?.path === "/ws/msdk/control/{aircraftSn}"
);
if (!msdkWs || msdkWs.publicOperatorApi !== false) {
  throw new Error("MSDK WebSocket safety contract missing or unsafe");
}
if (!/\^\\\/ws\\\/msdk\\\/control\\\/\(\[\^\/\]\+\)\$/.test(wsSource)) {
  throw new Error("MSDK WebSocket runtime route changed without contract update");
}

console.log(
  `Control API OpenAPI contract PASS: ${runtime.size} public HTTP operations + MSDK WebSocket safety extension`
);
