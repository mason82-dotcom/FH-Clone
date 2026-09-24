import fs from "node:fs";

function fail(message) {
  console.error(`msdk-pairing-preflight: ${message}`);
  process.exit(1);
}

function readDotEnv(path = ".env") {
  if (!fs.existsSync(path)) return {};
  const result = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function privateIpv4(host) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = /^172\.(\d{1,3})\./.exec(host);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validatePairingBaseUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    fail("invalid_pairing_base_url");
  }
  if (!url.hostname) fail("pairing_base_url_missing_host");
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && privateIpv4(url.hostname)) return url;
  fail("pairing_base_url_requires_https_or_private_lan_http");
}

async function getJson(baseUrl, path) {
  let response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    fail(`${path} unreachable: ${error.message ?? error}`);
  }
  const body = await response.text();
  let json;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    fail(`${path} returned_non_json_http_${response.status}`);
  }
  if (!response.ok) {
    fail(`${path} returned_http_${response.status}: ${body.slice(0, 200)}`);
  }
  return json;
}

const dotEnv = readDotEnv();
const env = { ...dotEnv, ...process.env };

for (const key of ["MSDK_PAIRING_TOKEN", "MSDK_BRIDGE_TOKEN_SECRET"]) {
  const value = env[key]?.trim();
  if (!value) fail(`${key} is not configured`);
  if (/^(change-me|replace-me|example)/i.test(value)) {
    fail(`${key} still contains a placeholder`);
  }
}

const ttl = Number(env.MSDK_BRIDGE_TOKEN_TTL_SECONDS || "86400");
if (!Number.isInteger(ttl) || ttl < 1) {
  fail("MSDK_BRIDGE_TOKEN_TTL_SECONDS must be a positive integer");
}

const apiPort = Number(env.FH2_API_PORT || "8080");
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  fail("FH2_API_PORT is invalid");
}

const localBase = new URL(`http://127.0.0.1:${apiPort}/`);
const ready = await getJson(localBase, "/ready");
if (ready.status !== "ready") fail("control_api_not_ready");

const health = await getJson(localBase, "/health");
if (health.status !== "ok") fail("control_api_not_healthy");
if (health.msdkBridge?.configured !== true) {
  fail("msdkBridge.configured is not true; recreate control-api after setting secrets");
}

const inputBase = process.argv[2]?.trim();
let pairingBase = null;
if (inputBase) {
  pairingBase = validatePairingBaseUrl(inputBase);
  const remoteHealth = await getJson(pairingBase, "/health");
  if (remoteHealth.msdkBridge?.configured !== true) {
    fail("LAN pairing endpoint does not report msdkBridge.configured=true");
  }
}

console.log("MSDK_PAIRING_PREFLIGHT=READY");
console.log("CONTROL_API=ready");
console.log("MSDK_BRIDGE=configured");
console.log(`TOKEN_TTL_SECONDS=${ttl}`);
console.log(
  pairingBase
    ? `PAIRING_BASE_URL=${pairingBase.toString().replace(/\/$/, "")}`
    : "PAIRING_BASE_URL=not_checked"
);
