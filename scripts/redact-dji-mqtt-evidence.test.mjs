import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = "scripts/redact-dji-mqtt-evidence.mjs";

function fixture() {
  return [
    {
      channel: "sys/product/RC-PRO-SERIAL-SECRET/status",
      payload: {
        method: "update_topo",
        data: {
          domain: 2,
          type: 144,
          sub_type: 0,
          nonce: "must-not-leak",
          sub_devices: [
            {
              sn: "AIRCRAFT-SERIAL-SECRET",
              domain: 0,
              type: 77,
              sub_type: 1
            }
          ]
        }
      }
    },
    {
      channel: "sys/product/RC-PRO-SERIAL-SECRET/status_reply",
      payload: { result: 0 }
    },
    {
      channel: "thing/product/AIRCRAFT-SERIAL-SECRET/osd",
      payload: {
        data: {
          attitude_head: 12,
          attitude_roll: 1,
          attitude_pitch: -2,
          latitude: 49.123456,
          longitude: 8.123456,
          height: 123.4,
          elevation: 35.6,
          horizontal_speed: 3.2,
          vertical_speed: -0.1,
          position_state: {
            is_fixed: 2,
            rtk_number: 18,
            gps_number: 22
          },
          battery: {
            batteries: [
              {
                sn: "BATTERY-SERIAL-SECRET",
                capacity_percent: 77
              }
            ]
          },
          cameras: [
            {
              payload_index: "67-0-0",
              sn: "CAMERA-SERIAL-SECRET"
            }
          ],
          device_secret: "must-not-leak"
        }
      }
    },
    {
      channel: "thing/product/AIRCRAFT-SERIAL-SECRET/osd",
      payload: {
        data: {
          position_state: {
            is_fixed: 1,
            rtk_number: 0
          }
        }
      }
    },
    {
      channel: "thing/product/AIRCRAFT-SERIAL-SECRET/state",
      payload: {
        data: {
          password: "must-not-leak",
          camera_mode: 1
        }
      }
    }
  ];
}

test("redactor emits a public M3T MQTT evidence manifest without identifiers, coordinates or secrets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-"));
  const input = path.join(dir, "raw.json");
  const output = path.join(dir, "redacted.json");
  fs.writeFileSync(input, JSON.stringify(fixture()));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3t", input, output],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /DJI_MQTT_EVIDENCE_REDACTION=OK/);

  const value = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(value.schema, "fh2.dji-mqtt.v1");
  assert.equal(value.realHardware, true);
  assert.equal(value.synthetic, false);
  assert.equal(value.redacted, true);
  assert.match(value.sourceSha256, /^[a-f0-9]{64}$/);

  assert.equal(value.topology.topic, "sys/product/GATEWAY_REDACTED/status");
  assert.equal(value.topology.data.type, 144);
  assert.equal(value.topology.data.sub_type, 0);
  assert.equal(value.topology.data.sub_devices[0].type, 77);
  assert.equal(value.topology.data.sub_devices[0].sub_type, 1);
  assert.equal(value.topology.data.sub_devices[0].sn, "AIRCRAFT_REDACTED");

  assert.equal(value.osd.topic, "thing/product/AIRCRAFT_REDACTED/osd");
  assert.equal(value.osd.data.latitude, null);
  assert.equal(value.osd.data.longitude, null);
  assert.equal(value.osd.data.cameras[0].payload_index, "67-0-0");
  assert.deepEqual(value.osd.data.battery.batteries, [{ present: true }]);

  assert.equal(value.rtk.fixed.position_state.is_fixed, 2);
  assert.equal(value.rtk.notFixed.position_state.is_fixed, 1);

  const encoded = JSON.stringify(value);
  for (const forbidden of [
    "RC-PRO-SERIAL-SECRET",
    "AIRCRAFT-SERIAL-SECRET",
    "BATTERY-SERIAL-SECRET",
    "CAMERA-SERIAL-SECRET",
    "49.123456",
    "8.123456",
    "must-not-leak",
    "device_secret",
    "password",
    "nonce"
  ]) {
    assert.equal(encoded.includes(forbidden), false, `leaked: ${forbidden}`);
  }
});

test("redactor requires explicit real-hardware acknowledgement", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-"));
  const input = path.join(dir, "raw.json");
  fs.writeFileSync(input, JSON.stringify(fixture()));

  const run = spawnSync(process.execPath, [script, input], {
    encoding: "utf8"
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--real-hardware/);
});


test("redactor tolerates disconnected update_topo snapshots around one connected pair", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-topology-transition-"));
  const input = path.join(dir, "raw.json");
  const output = path.join(dir, "redacted.json");
  const rows = fixture();

  const disconnected = {
    channel: "sys/product/RC-PRO-SERIAL-SECRET/status",
    payload: {
      method: "update_topo",
      data: {
        domain: 2,
        type: 144,
        sub_type: 0,
        sub_devices: []
      }
    }
  };

  fs.writeFileSync(
    input,
    JSON.stringify([disconnected, ...rows, disconnected])
  );

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3t", input, output],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
  const value = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(value.topology.data.sub_devices.length, 1);
  assert.equal(value.topology.data.sub_devices[0].type, 77);
  assert.equal(value.topology.data.sub_devices[0].sub_type, 1);
});

test("redactor rejects captures containing different connected topology aircraft", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-topology-mixed-"));
  const input = path.join(dir, "raw.json");
  const rows = fixture();
  rows.push({
    channel: "sys/product/RC-PRO-SERIAL-SECRET/status",
    payload: {
      method: "update_topo",
      data: {
        domain: 2,
        type: 144,
        sub_type: 0,
        sub_devices: [
          {
            sn: "OTHER-AIRCRAFT",
            domain: 0,
            type: 77,
            sub_type: 1
          }
        ]
      }
    }
  });
  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3t", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /multiple topology aircraft|narrow/i);
});

test("redactor rejects a capture that mixes multiple aircraft", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-"));
  const input = path.join(dir, "raw.json");
  const rows = fixture();
  rows.push({
    channel: "thing/product/OTHER-AIRCRAFT/osd",
    payload: {
      data: {
        position_state: { is_fixed: 1 }
      }
    }
  });
  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3t", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /multiple|aircraft|narrow/i);
});


test("redactor emits M3E profile evidence only for 77/0 with payload 66-0-0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-m3e-"));
  const input = path.join(dir, "raw.json");
  const output = path.join(dir, "redacted.json");
  const rows = fixture();

  rows[0].payload.data.sub_devices[0].sub_type = 0;
  rows[2].payload.data.cameras[0].payload_index = "66-0-0";

  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3e", input, output],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
  const value = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(value.profile, "m3e");
  assert.equal(value.expectedPayloadIndex, "66-0-0");
  assert.equal(value.topology.data.sub_devices[0].sub_type, 0);
  assert.equal(value.osd.data.cameras[0].payload_index, "66-0-0");
});

test("redactor rejects product/profile mismatches", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-profile-"));
  const input = path.join(dir, "raw.json");
  fs.writeFileSync(input, JSON.stringify(fixture()));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3e", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /profile m3e expects aircraft/i);
});

test("redactor requires an explicit product profile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-profile-"));
  const input = path.join(dir, "raw.json");
  fs.writeFileSync(input, JSON.stringify(fixture()));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--profile/);
});

test("gateway Thing OSD does not count as a second aircraft", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-gateway-osd-"));
  const input = path.join(dir, "raw.json");
  const output = path.join(dir, "redacted.json");
  const rows = fixture();
  rows.push({
    channel: "thing/product/RC-PRO-SERIAL-SECRET/osd",
    payload: { data: { app_version: "1.0", capacity_percent: 90 } }
  });
  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3t", input, output],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
});


test("redactor accepts DJI product identity fields encoded as numeric strings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-domain-"));
  const input = path.join(dir, "raw.json");
  const output = path.join(dir, "redacted.json");
  const rows = fixture();

  rows[0].payload.data.domain = "2";
  rows[0].payload.data.type = "144";
  rows[0].payload.data.sub_type = "0";
  rows[0].payload.data.sub_devices[0].domain = "0";
  rows[0].payload.data.sub_devices[0].type = "77";
  rows[0].payload.data.sub_devices[0].sub_type = "0";
  rows[2].payload.data.cameras[0].payload_index = "66-0-0";

  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3e", input, output],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
  const value = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(value.topology.data.domain, 2);
  assert.equal(value.topology.data.type, 144);
  assert.equal(value.topology.data.sub_type, 0);
  assert.equal(value.topology.data.sub_devices[0].domain, 0);
  assert.equal(value.topology.data.sub_devices[0].type, 77);
  assert.equal(value.topology.data.sub_devices[0].sub_type, 0);
});

test("redactor rejects a missing product domain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-domain-"));
  const input = path.join(dir, "raw.json");
  const rows = fixture();

  delete rows[0].payload.data.domain;
  rows[0].payload.data.sub_devices[0].sub_type = 0;
  rows[2].payload.data.cameras[0].payload_index = "66-0-0";
  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3e", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /expects gateway/i);
});

test("redactor rejects a conflicting observed numeric-string domain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-mqtt-redact-domain-"));
  const input = path.join(dir, "raw.json");
  const rows = fixture();

  rows[0].payload.data.domain = "99";
  rows[0].payload.data.sub_devices[0].sub_type = 0;
  rows[2].payload.data.cameras[0].payload_index = "66-0-0";
  fs.writeFileSync(input, JSON.stringify(rows));

  const run = spawnSync(
    process.execPath,
    [script, "--real-hardware", "--profile", "m3e", input],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /expects gateway/i);
});
