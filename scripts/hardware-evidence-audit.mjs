import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scope = process.env.FH2_HARDWARE_SCOPE === "all" ? "all" : "main";

const results = [];

function add(gate, level, name, ok, detail = "") {
  results.push({ gate, level, name, ok: Boolean(ok), detail });
}

function file(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(file(rel));
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(file(rel), "utf8"));
  } catch {
    return undefined;
  }
}

function record(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function get(obj, dotted) {
  let value = obj;
  for (const key of dotted.split(".")) {
    if (!record(value) && !Array.isArray(value)) return undefined;
    value = value[key];
  }
  return value;
}

function findRecord(rootValue, predicate) {
  const stack = [rootValue];
  while (stack.length) {
    const value = stack.pop();
    if (record(value)) {
      if (predicate(value)) return value;
      stack.push(...Object.values(value));
    } else if (Array.isArray(value)) {
      stack.push(...value);
    }
  }
  return undefined;
}

function hasMethod(rootValue, method) {
  return Boolean(findRecord(rootValue, (v) => v.method === method));
}

function hasTopic(rootValue, pattern) {
  return Boolean(
    findRecord(
      rootValue,
      (v) => typeof v.topic === "string" && pattern.test(v.topic)
    )
  );
}

function sha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function realEvidence(value) {
  return record(value) &&
    value.realHardware === true &&
    value.synthetic !== true &&
    value.redacted === true;
}

function sensitiveValueLeaked(value) {
  const sensitive = new Set([
    "device_secret",
    "nonce",
    "password",
    "token",
    "auth_token",
    "secret_code"
  ]);
  const redacted = new Set(["", "***", "[REDACTED]", "REDACTED"]);
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (record(current)) {
      for (const [key, child] of Object.entries(current)) {
        if (sensitive.has(key.toLowerCase())) {
          if (child === null || child === undefined) continue;
          if (typeof child === "string" && redacted.has(child)) continue;
          if (Array.isArray(child) && child.length === 0) continue;
          return true;
        }
        stack.push(child);
      }
    } else if (Array.isArray(current)) {
      stack.push(...current);
    }
  }
  return false;
}

function requiredFor(level) {
  if (level === "REQUIRED_MAIN") return true;
  if (level === "REQUIRED_DRAFT") return scope === "all";
  return false;
}

// ---------------------------------------------------------------------------
// M3T + RC Pro Enterprise
// ---------------------------------------------------------------------------
const m3tManifestPath = "docs/fixtures/m3t/media-manifest.json";
const m3tManifest = readJson(m3tManifestPath);
add(
  "M3T_RC_PRO",
  "REQUIRED_MAIN",
  "bestehender realer M3T-Wide-Medienbeleg",
  record(m3tManifest) &&
    arr(m3tManifest.samples).some((s) => s?.deviceModel === "M3T" && s?.imageSource === "WideCamera"),
  m3tManifestPath
);

const m3tMqttPath = "docs/fixtures/m3t/mqtt-evidence.json";
const m3tMqtt = readJson(m3tMqttPath);
add("M3T_RC_PRO", "REQUIRED_MAIN", "reales redigiertes MQTT-Evidence-Manifest", realEvidence(m3tMqtt), m3tMqttPath);
if (realEvidence(m3tMqtt)) {
  add("M3T_RC_PRO", "REQUIRED_MAIN", "keine Secrets im öffentlichen M3T-Fixture", !sensitiveValueLeaked(m3tMqtt));
  const rcProTopo = findRecord(
    m3tMqtt,
    (v) =>
      v.method === "update_topo" &&
      typeof v.topic === "string" &&
      /^(thing|sys)\/product\/[^/]+\/status$/.test(v.topic)
  );
  add(
    "M3T_RC_PRO",
    "REQUIRED_MAIN",
    "RC Pro update_topo auf dokumentiertem Statuspfad",
    Boolean(rcProTopo),
    rcProTopo?.topic ? `observed=${rcProTopo.topic}` : "kein Upstream-Topic"
  );
  add(
    "M3T_RC_PRO",
    "REQUIRED_MAIN",
    "RC Pro update_topo Reply auf sys/product/.../status_reply",
    hasTopic(m3tMqtt, /^sys\/product\/[^/]+\/status_reply$/)
  );
  const gateway = findRecord(m3tMqtt, (v) => Number(v.type) === 144 && Number(v.sub_type ?? v.subType) === 0);
  const aircraft = findRecord(m3tMqtt, (v) => Number(v.type) === 77 && Number(v.sub_type ?? v.subType) === 1);
  add("M3T_RC_PRO", "REQUIRED_MAIN", "Produktidentität RC Pro Enterprise 144/0", Boolean(gateway));
  add("M3T_RC_PRO", "REQUIRED_MAIN", "Produktidentität M3T 77/1", Boolean(aircraft));

  const osd = m3tMqtt.osd;
  const state = m3tMqtt.state;
  const osdData = record(osd?.data) ? osd.data : osd;
  add("M3T_RC_PRO", "REQUIRED_MAIN", "M3T OSD Topic", typeof osd?.topic === "string" && /^thing\/product\/[^/]+\/osd$/.test(osd.topic));
  add("M3T_RC_PRO", "REQUIRED_MAIN", "M3T State Topic", typeof state?.topic === "string" && /^thing\/product\/[^/]+\/state$/.test(state.topic));
  for (const key of ["attitude_head", "attitude_roll", "attitude_pitch", "latitude", "longitude", "height", "elevation", "horizontal_speed", "vertical_speed"]) {
    add("M3T_RC_PRO", "REQUIRED_MAIN", `OSD Feld ${key}`, get(osdData, key) !== undefined);
  }
  add("M3T_RC_PRO", "REQUIRED_MAIN", "OSD position_state.is_fixed", get(osdData, "position_state.is_fixed") !== undefined);
  add("M3T_RC_PRO", "REQUIRED_MAIN", "OSD battery.batteries[]", arr(get(osdData, "battery.batteries")).length > 0);
  add("M3T_RC_PRO", "REQUIRED_MAIN", "OSD cameras[] mit M3T-Payload 67-0-0",
    arr(get(osdData, "cameras")).some((c) => c?.payload_index === "67-0-0"));

  const fixed = m3tMqtt.rtk?.fixed;
  const notFixed = m3tMqtt.rtk?.notFixed;
  add("M3T_RC_PRO", "REQUIRED_MAIN", "MQTT RTK Fixed via is_fixed=2",
    Number(get(fixed, "position_state.is_fixed")) === 2 && Number(get(fixed, "position_state.rtk_number")) >= 0);
  add("M3T_RC_PRO", "REQUIRED_MAIN", "MQTT RTK Nicht-Fixed separat",
    [0, 1, 3].includes(Number(get(notFixed, "position_state.is_fixed"))));
}

const m3tExtraMediaPath = "docs/fixtures/m3t/media-evidence.json";
const m3tExtraMedia = readJson(m3tExtraMediaPath);
const m3tMediaSamples = arr(m3tExtraMedia?.samples);
add("M3T_RC_PRO", "REQUIRED_MAIN", "realer Tele/Zoom-JPEG-Metadatenbeleg",
  realEvidence(m3tExtraMedia) &&
  m3tMediaSamples.some((s) => ["tele", "zoom"].includes(String(s?.role).toLowerCase()) && sha256(s?.sourceSha256)),
  m3tExtraMediaPath);
add("M3T_RC_PRO", "REQUIRED_MAIN", "realer Thermal-R-JPEG-Metadatenbeleg",
  realEvidence(m3tExtraMedia) &&
  m3tMediaSamples.some((s) => ["thermal-rjpeg", "rjpeg", "thermal"].includes(String(s?.role).toLowerCase()) && sha256(s?.sourceSha256)),
  m3tExtraMediaPath);

// ---------------------------------------------------------------------------
// M4T + RC Plus 2 manual cloud control: globally disabled
// ---------------------------------------------------------------------------
const m4tPath = "docs/fixtures/m4t/hardware-evidence.json";
const m4t = readJson(m4tPath);
add(
  "M4T_MANUAL_CONTROL",
  "INFORMATIONAL",
  "manuelle DJI-Cloud-Flugsteuerung ist global deaktiviert",
  true,
  "stick_control/drone_control werden von keinem Produktprofil aktiviert"
);
add(
  "M4T_MANUAL_CONTROL",
  "INFORMATIONAL",
  "optionales reales M4T/RC-Plus-2-Protokoll-Evidence",
  realEvidence(m4t),
  m4tPath
);
if (realEvidence(m4t)) {
  add("M4T_MANUAL_CONTROL", "INFORMATIONAL", "keine Secrets im öffentlichen M4T-Fixture", !sensitiveValueLeaked(m4t));
  add("M4T_MANUAL_CONTROL", "INFORMATIONAL", "RC Plus 2 update_topo beobachtet",
    hasMethod(m4t, "update_topo") && hasTopic(m4t, /^thing\/product\/[^/]+\/status$/));
  add("M4T_MANUAL_CONTROL", "INFORMATIONAL", "Produktidentität RC Plus 2 174/0",
    Boolean(findRecord(m4t, (v) => Number(v.type) === 174 && Number(v.sub_type ?? v.subType) === 0)));
  add("M4T_MANUAL_CONTROL", "INFORMATIONAL", "Produktidentität M4T 99/1",
    Boolean(findRecord(m4t, (v) => Number(v.type) === 99 && Number(v.sub_type ?? v.subType) === 1)));
}

const m4tMediaPath = "docs/fixtures/m4t/media-evidence.json";
const m4tMedia = readJson(m4tMediaPath);
const m4tMediaSamples = arr(m4tMedia?.samples);
add("M4T_MEDIA", "REQUIRED_MAIN", "realer M4T-Thermal-Medienbeleg",
  realEvidence(m4tMedia) &&
  m4tMediaSamples.some((s) =>
    ["thermal-rjpeg", "rjpeg", "thermal"].includes(String(s?.role).toLowerCase()) &&
    sha256(s?.sourceSha256)
  ),
  m4tMediaPath);
if (realEvidence(m4tMedia)) {
  add("M4T_MEDIA", "REQUIRED_MAIN", "keine Secrets im M4T-Medienbeleg", !sensitiveValueLeaked(m4tMedia));
  add("M4T_MEDIA", "REQUIRED_MAIN", "M4T-Modellzuordnung real dokumentiert",
    m4tMediaSamples.some((s) => String(s?.deviceModel).toUpperCase() === "M4T"));
}

// ---------------------------------------------------------------------------
// M3M multispectral capture
// ---------------------------------------------------------------------------
const m3mPath = "docs/fixtures/m3m/capture-set.json";
const m3m = readJson(m3mPath);
add("M3M", "REQUIRED_MAIN", "reales redigiertes M3M-Capture-Set", realEvidence(m3m), m3mPath);
if (realEvidence(m3m)) {
  add("M3M", "REQUIRED_MAIN", "keine Secrets im öffentlichen M3M-Fixture", !sensitiveValueLeaked(m3m));
  const bands = arr(m3m.bands);
  const expected = new Map([
    ["Green", 1],
    ["Red", 2],
    ["RedEdge", 3],
    ["NIR", 4]
  ]);
  for (const [band, sensorIndex] of expected) {
    const sample = bands.find((b) => b?.BandName === band);
    add("M3M", "REQUIRED_MAIN", `Band ${band} vorhanden`, Boolean(sample));
    if (!sample) continue;
    add("M3M", "REQUIRED_MAIN", `${band}: SensorIndex=${sensorIndex}`, Number(sample.SensorIndex) === sensorIndex);
    add("M3M", "REQUIRED_MAIN", `${band}: BandFreq`, typeof sample.BandFreq === "string" && sample.BandFreq.length > 0);
    add("M3M", "REQUIRED_MAIN", `${band}: CaptureUUID`, typeof sample.CaptureUUID === "string" && sample.CaptureUUID.length > 0);
    add("M3M", "REQUIRED_MAIN", `${band}: UTCAtExposure`, typeof sample.UTCAtExposure === "string" && sample.UTCAtExposure.length > 0);
    for (const key of ["Irradiance", "SensorGain", "SensorGainAdjustment", "ExposureTime", "RawData"]) {
      add("M3M", "REQUIRED_MAIN", `${band}: ${key}`, sample[key] !== undefined);
    }
  }
  const uuids = bands.map((b) => b?.CaptureUUID).filter((v) => typeof v === "string" && v);
  add("M3M", "INFORMATIONAL", "beobachtete CaptureUUID-Gruppierung",
    uuids.length === 4,
    uuids.length ? `unique=${new Set(uuids).size}` : "keine UUIDs");
  const calibrationObserved = bands.some((b) =>
    ["VignettingData", "DewarpData", "DewarpHMatrix", "CalibratedHMatrix"].some((k) => b?.[k] !== undefined)
  );
  add("M3M", "REQUIRED_MAIN", "mindestens ein geometrisches/radiometrisches Kalibrierfeld beobachtet", calibrationObserved);
}

// ---------------------------------------------------------------------------
// Global feature policy
// ---------------------------------------------------------------------------
add("GLOBAL_POLICY", "INFORMATIONAL", "DJI Dock 1-3 global deaktiviert", true, "domain=3 wird in der Runtime verworfen");
add("GLOBAL_POLICY", "INFORMATIONAL", "Multi-Dock global deaktiviert", true, "keine Fixture- oder Runtime-Freigabe");
add("GLOBAL_POLICY", "INFORMATIONAL", "PSDK-Payloads global deaktiviert", true, "psdk_* und drc_psdk_* gesperrt");

// ---------------------------------------------------------------------------
// WPML + Pilot Wayline catalog (PR #51)
// ---------------------------------------------------------------------------
const wpmlPath = "docs/fixtures/wpml/evidence.json";
const wpml = readJson(wpmlPath);
add("WPML_PILOT", "REQUIRED_DRAFT", "reales Pilot-2-WPML-Evidence", realEvidence(wpml), wpmlPath);
if (realEvidence(wpml)) {
  add("WPML_PILOT", "REQUIRED_DRAFT", "Quelle ist DJI Pilot 2", wpml.generatedBy === "DJI Pilot 2");
  add("WPML_PILOT", "REQUIRED_DRAFT", "authoritative KMZ SHA-256", sha256(wpml.sourceSha256));
  const archiveEntries = arr(wpml.archiveEntries).map((v) => String(v).replace(/^\/+/, ""));
  add("WPML_PILOT", "REQUIRED_DRAFT", "template.kml im realen KMZ",
    archiveEntries.some((v) => /(^|\/)template\.kml$/i.test(v)));
  add("WPML_PILOT", "REQUIRED_DRAFT", "waylines.wpml im realen Standard-KMZ",
    archiveEntries.some((v) => /(^|\/)waylines\.wpml$/i.test(v)));
  const resourceReferences = arr(wpml.resourceReferences)
    .map((v) => String(v).replace(/^\/+/, ""));
  add("WPML_PILOT", "REQUIRED_DRAFT", "referenzierte WPML-Ressourcen sind im KMZ vorhanden",
    resourceReferences.every((ref) =>
      archiveEntries.some((entry) =>
        entry === ref ||
        entry === `wpmz/${ref}` ||
        entry.endsWith(`/${ref}`)
      )
    ),
    resourceReferences.length ? `refs=${resourceReferences.length}` : "keine Ressourcen referenziert");
  add("WPML_PILOT", "INFORMATIONAL", "res/-Ressourcenbereich beobachtet", true,
    archiveEntries.some((v) => /(^|\/)res\//i.test(v)) ? "vorhanden" : "kein ZIP-Eintrag beobachtet");
  add("WPML_PILOT", "REQUIRED_DRAFT", "Parservergleich gegen Original erfolgreich", wpml.parserComparison?.pass === true);
  add("WPML_PILOT", "REQUIRED_DRAFT", "MissionConfig/IDs/Höhen/Indizes geprüft",
    ["missionConfig", "productEnums", "heightModes", "templateWaylineIds", "continuousWaypointIndices"]
      .every((k) => wpml.parserComparison?.checks?.[k] === true));
  add("WPML_PILOT", "REQUIRED_DRAFT", "realer Pilot-Wayline-Katalog belegt",
    wpml.pilotCatalog?.realWorkspace === true &&
    wpml.pilotCatalog?.responseValidated === true &&
    wpml.pilotCatalog?.tokenPresentInFixture !== true);
}

// ---------------------------------------------------------------------------
// DJI Pilot 2 JSBridge (PR #46)
// ---------------------------------------------------------------------------
const jsPath = "docs/fixtures/pilot2/jsbridge-session.json";
const js = readJson(jsPath);
add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "reale redigierte Pilot-2-JSBridge-Session", realEvidence(js), jsPath);
if (realEvidence(js)) {
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "window.djiBridge vorhanden", js.bridgePresent === true);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "License verifiziert", js.platformIsVerified === true);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Pilot-2-Version erfasst",
    typeof js.platformVersion === "string" && js.platformVersion.length > 0);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "RC-/Aircraft-IDs nur gehasht",
    sha256(js.remoteControllerSnSha256) && sha256(js.aircraftSnSha256));
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "exakter Topologie-Pair-Match", js.topologyPairMatch === true);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Cloud-Modul thing geladen und verbunden",
    js.modules?.thing?.loaded === true && js.modules?.thing?.connected === true);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Workspace gesetzt", js.workspace?.configured === true);
  if (js.features?.map === true) {
    add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Map: API+WS+Map geladen",
      js.modules?.api?.loaded === true &&
      js.modules?.ws?.loaded === true &&
      js.modules?.map?.loaded === true);
  }
  if (js.features?.tsa === true) {
    add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "TSA: API+WS+TSA geladen",
      js.modules?.api?.loaded === true &&
      js.modules?.ws?.loaded === true &&
      js.modules?.tsa?.loaded === true);
  }
  if (js.features?.mission === true) {
    add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Mission: API+WS+Mission geladen",
      js.modules?.api?.loaded === true &&
      js.modules?.ws?.loaded === true &&
      js.modules?.mission?.loaded === true);
  }
  if (js.features?.media === true) {
    add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Media: API+Media geladen",
      js.modules?.api?.loaded === true &&
      js.modules?.media?.loaded === true);
  }
  if (js.features?.live === true || js.features?.livestream === true) {
    add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Live: Liveshare-Modul geladen",
      js.modules?.liveshare?.loaded === true);
  }
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "Browser-Bundle Secret-Scan grün", js.browserBundleSecretScanPass === true);
  add("PILOT2_JSBRIDGE", "REQUIRED_DRAFT", "keine Secrets im veröffentlichten Session-Fixture", !sensitiveValueLeaked(js));
}

// ---------------------------------------------------------------------------
// MSDK PR #44: contract only
// ---------------------------------------------------------------------------
add("MSDK_KEYMANAGER", "INFORMATIONAL", "PR #44 benötigt ohne Android-Runtime kein Hardware-Fixture", true);

const activeFailures = results.filter((r) => requiredFor(r.level) && !r.ok);
const lines = [
  "# FH2 DJI Hardware Evidence",
  "",
  `Scope: **${scope}**`,
  "",
  "| Gate | Level | Check | Result | Detail |",
  "| --- | --- | --- | --- | --- |"
];

for (const r of results) {
  const active = requiredFor(r.level);
  const status = r.ok ? "PASS" : active ? "FAIL" : "PENDING";
  lines.push(`| ${r.gate} | ${r.level} | ${r.name.replaceAll("|", "\\|")} | ${status} | ${String(r.detail ?? "").replaceAll("|", "\\|")} |`);
}

lines.push("", `Active failures: **${activeFailures.length}**`, "");
const report = lines.join("\n");
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
}

if (activeFailures.length) {
  process.exitCode = 1;
}
