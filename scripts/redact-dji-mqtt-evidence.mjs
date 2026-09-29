import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`DJI_MQTT_EVIDENCE_REDACTION_ERROR: ${message}`);
  process.exit(1);
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function string(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["rows", "messages", "events", "records"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function topicOf(row) {
  return string(row?.channel) ?? string(row?.topic);
}

function payloadOf(row) {
  if (record(row?.payload)) return row.payload;
  if (record(row?.message)) return row.message;
  return record(row) ? row : {};
}

function dataOf(payload) {
  return record(payload?.data) ? payload.data : payload;
}

function findRow(rows, predicate) {
  return rows.find((row) => {
    const topic = topicOf(row);
    const payload = payloadOf(row);
    return topic ? predicate(topic, payload, dataOf(payload)) : false;
  });
}

function sanitizeProduct(product, role) {
  if (!record(product)) return undefined;
  const type = integer(product.type);
  if (type === null) return undefined;
  const subType = integer(product.sub_type ?? product.subType) ?? 0;
  const out = {
    sn: role === "gateway" ? "GATEWAY_REDACTED" : "AIRCRAFT_REDACTED",
    type,
    sub_type: subType
  };
  const domain = product.domain;
  if (typeof domain === "number" || typeof domain === "string") out.domain = domain;
  const thingVersion = string(product.thing_version ?? product.thingVersion ?? product.version);
  if (thingVersion) out.thing_version = thingVersion;
  const index = string(product.index);
  if (index) out.index = index;
  return out;
}

function sanitizeTopology(row) {
  if (!row) return undefined;
  const payload = payloadOf(row);
  const data = dataOf(payload);
  if (!record(data)) return undefined;

  const gateway = sanitizeProduct(data, "gateway");
  if (!gateway) return undefined;

  const subDevices = array(data.sub_devices ?? data.subDevices)
    .map((entry) => sanitizeProduct(entry, "aircraft"))
    .filter(Boolean);

  return {
    topic: "sys/product/GATEWAY_REDACTED/status",
    method: "update_topo",
    data: {
      ...(gateway.domain !== undefined ? { domain: gateway.domain } : {}),
      type: gateway.type,
      sub_type: gateway.sub_type,
      ...(gateway.thing_version ? { thing_version: gateway.thing_version } : {}),
      sub_devices: subDevices
    }
  };
}

function sanitizePositionState(value) {
  if (!record(value)) return undefined;
  const out = {};
  for (const key of ["is_fixed", "quality", "gps_number", "rtk_number"]) {
    const n = finite(value[key]);
    if (n !== null) out[key] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeOsgData(data) {
  if (!record(data)) return {};
  const out = {};

  for (const key of [
    "attitude_head",
    "attitude_roll",
    "attitude_pitch",
    "height",
    "elevation",
    "horizontal_speed",
    "vertical_speed"
  ]) {
    const n = finite(data[key]);
    if (n !== null) out[key] = n;
  }

  // Coordinates are intentionally retained only as field-presence markers.
  if (Object.hasOwn(data, "latitude")) out.latitude = null;
  if (Object.hasOwn(data, "longitude")) out.longitude = null;

  const positionState = sanitizePositionState(data.position_state);
  if (positionState) out.position_state = positionState;

  const batteries = array(data?.battery?.batteries);
  if (batteries.length) {
    out.battery = {
      batteries: batteries.map(() => ({ present: true }))
    };
  }

  const cameras = array(data.cameras)
    .map((camera) => {
      const payloadIndex = string(camera?.payload_index);
      return payloadIndex ? { payload_index: payloadIndex } : undefined;
    })
    .filter(Boolean);
  if (cameras.length) out.cameras = cameras;

  return out;
}

function sanitizeOsd(row) {
  if (!row) return undefined;
  const payload = payloadOf(row);
  return {
    topic: "thing/product/AIRCRAFT_REDACTED/osd",
    data: sanitizeOsgData(dataOf(payload))
  };
}

function sanitizeState(row) {
  if (!row) return undefined;
  return {
    topic: "thing/product/AIRCRAFT_REDACTED/state",
    data: { observed: true }
  };
}

function rtkSnapshot(row) {
  if (!row) return undefined;
  const state = sanitizePositionState(dataOf(payloadOf(row))?.position_state);
  return state ? { position_state: state } : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const realIndex = args.indexOf("--real-hardware");
  if (realIndex < 0) {
    fail("use --real-hardware explicitly for a real capture");
  }
  args.splice(realIndex, 1);

  if (args.length < 1 || args.length > 2) {
    fail("usage: node scripts/redact-dji-mqtt-evidence.mjs --real-hardware <input.json> [output.json]");
  }

  const inputPath = path.resolve(args[0]);
  const outputPath = path.resolve(
    args[1] ?? "docs/fixtures/m3t/mqtt-evidence.json"
  );

  let rawBytes;
  let input;
  try {
    rawBytes = fs.readFileSync(inputPath);
    input = JSON.parse(rawBytes.toString("utf8"));
  } catch (error) {
    fail(`cannot read input: ${error instanceof Error ? error.message : String(error)}`);
  }

  const rows = rowsFrom(input).filter(record);
  if (!rows.length) fail("input contains no rows/messages/events");

  const topologyRow = findRow(
    rows,
    (topic, payload) =>
      /^sys\/product\/[^/]+\/status$/.test(topic) &&
      payload?.method === "update_topo"
  );
  const statusReplyRow = findRow(
    rows,
    (topic) => /^sys\/product\/[^/]+\/status_reply$/.test(topic)
  );
  const osdRows = rows.filter((row) =>
    /^thing\/product\/[^/]+\/osd$/.test(topicOf(row) ?? "")
  );
  const stateRow = findRow(
    rows,
    (topic) => /^thing\/product\/[^/]+\/state$/.test(topic)
  );

  const fixedRow = osdRows.find(
    (row) => Number(dataOf(payloadOf(row))?.position_state?.is_fixed) === 2
  );
  const notFixedRow = osdRows.find((row) =>
    [0, 1, 3].includes(Number(dataOf(payloadOf(row))?.position_state?.is_fixed))
  );

  // Prefer the richest OSD sample for the public structural proof.
  const osdRow =
    osdRows.find((row) => array(dataOf(payloadOf(row))?.cameras).length > 0) ??
    osdRows[0];

  const output = {
    schema: "fh2.dji-mqtt.v1",
    realHardware: true,
    synthetic: false,
    redacted: true,
    sourceSha256: sha256(rawBytes),
    sourceSummary: {
      inputRows: rows.length,
      osdRows: osdRows.length,
      updateTopoObserved: Boolean(topologyRow),
      statusReplyObserved: Boolean(statusReplyRow),
      stateObserved: Boolean(stateRow),
      rtkFixedObserved: Boolean(fixedRow),
      rtkNotFixedObserved: Boolean(notFixedRow)
    },
    ...(sanitizeTopology(topologyRow) ? { topology: sanitizeTopology(topologyRow) } : {}),
    ...(statusReplyRow
      ? { statusReply: { topic: "sys/product/GATEWAY_REDACTED/status_reply" } }
      : {}),
    ...(sanitizeOsd(osdRow) ? { osd: sanitizeOsd(osdRow) } : {}),
    ...(sanitizeState(stateRow) ? { state: sanitizeState(stateRow) } : {}),
    rtk: {
      ...(rtkSnapshot(fixedRow) ? { fixed: rtkSnapshot(fixedRow) } : {}),
      ...(rtkSnapshot(notFixedRow) ? { notFixed: rtkSnapshot(notFixedRow) } : {})
    }
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", {
    mode: 0o600
  });

  console.log("DJI_MQTT_EVIDENCE_REDACTION=OK");
  console.log(`OUTPUT=${outputPath}`);
  console.log(`SOURCE_SHA256=${output.sourceSha256}`);
  console.log(`INPUT_ROWS=${rows.length}`);
  console.log(`OSD_ROWS=${osdRows.length}`);
}

main();
