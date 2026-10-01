import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = "scripts/export-m3m-capture-evidence.mjs";

function metadataFor(sourceFile, bandName, sensorIndex, bandFreq) {
  return {
    SourceFile: sourceFile,
    "XMP-drone-dji:DroneSerialNumber": "AIRCRAFT-SERIAL-SECRET",
    "XMP-drone-dji:CameraSerialNumber": "CAMERA-SERIAL-SECRET",
    "XMP-drone-dji:ImageSource": `MS_${bandName.toUpperCase()}_CAMERA`,
    "XMP-drone-dji:BandName": bandName,
    "XMP-drone-dji:BandFreq": bandFreq,
    "XMP-drone-dji:SensorIndex": sensorIndex,
    "XMP-drone-dji:CaptureUUID": "123e4567-e89b-42d3-a456-426614174000",
    "XMP-drone-dji:UTCAtExposure": "2026:10:01 08:30:00.123",
    "XMP-drone-dji:GpsLatitude": 49.123456,
    "XMP-drone-dji:GpsLongitude": 8.123456,
    "XMP-drone-dji:AbsoluteAltitude": 145.5,
    "XMP-drone-dji:RelativeAltitude": 42.3,
    "XMP-drone-dji:RtkFlag": 50,
    "XMP-drone-dji:FlightRollDegree": 0.5,
    "XMP-drone-dji:FlightPitchDegree": -1.25,
    "XMP-drone-dji:FlightYawDegree": 95.5,
    "XMP-drone-dji:GimbalRollDegree": 0.1,
    "XMP-drone-dji:GimbalPitchDegree": -89.8,
    "XMP-drone-dji:GimbalYawDegree": 95.4,
    "XMP-drone-dji:Irradiance": 1234.5,
    "XMP-drone-dji:LS_status": 1,
    "XMP-drone-dji:RawData": "10 20 30 40",
    "XMP-drone-dji:SensorGain": 2,
    "XMP-drone-dji:SensorGainAdjustment": 1.05,
    "XMP-drone-dji:ExposureTime": 2500,
    "XMP-drone-dji:BlackCurrent": 64,
    "XMP-drone-dji:VignettingData": "1 2 3 4",
    "XMP-drone-dji:DewarpData": "2026-01-01;fx,fy,cx,cy,k1,k2,p1,p2,k3",
    "XMP-drone-dji:CalibratedHMatrix": "1 0 0 0 1 0 0 0 1"
  };
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh2-m3m-capture-"));
  const specs = [
    ["green.tif", "Green", 1, "560 (+/- 16) nm"],
    ["red.tif", "Red", 2, "650 (+/- 16) nm"],
    ["rededge.tif", "RedEdge", 3, "730 (+/- 16) nm"],
    ["nir.tif", "NIR", 4, "860 (+/- 26) nm"]
  ];
  for (const [fileName, bandName] of specs) {
    fs.writeFileSync(path.join(dir, fileName), `TIFF-${bandName}-REAL-BYTES`);
  }
  const metadata = specs.map(([fileName, bandName, sensorIndex, bandFreq]) =>
    metadataFor(fileName, bandName, sensorIndex, bandFreq)
  );
  const metadataPath = path.join(dir, "exiftool.json");
  const outputPath = path.join(dir, "capture-set.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  return { dir, metadata, metadataPath, outputPath };
}

test("exports a sanitized real M3M four-band capture manifest", () => {
  const fixture = createFixture();
  const run = spawnSync(
    process.execPath,
    [
      script,
      "--real-hardware",
      "--metadata-json",
      fixture.metadataPath,
      "--root",
      fixture.dir,
      "--out",
      fixture.outputPath
    ],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /M3M_CAPTURE_EVIDENCE_EXPORT=OK/);

  const value = JSON.parse(fs.readFileSync(fixture.outputPath, "utf8"));
  assert.equal(value.schema, "fh2.m3m-capture.v1");
  assert.equal(value.realHardware, true);
  assert.equal(value.synthetic, false);
  assert.equal(value.redacted, true);
  assert.equal(value.bands.length, 4);
  assert.deepEqual(
    value.bands.map((band) => [band.BandName, band.SensorIndex]),
    [["Green", 1], ["Red", 2], ["RedEdge", 3], ["NIR", 4]]
  );
  assert.equal(new Set(value.bands.map((band) => band.CaptureUUID)).size, 1);
  assert.match(value.bands[0].CaptureUUID, /^sha256:[a-f0-9]{64}$/);
  assert.equal(value.bands.every((band) => /^[a-f0-9]{64}$/.test(band.sourceSha256)), true);
  assert.equal(value.bands.every((band) => band.GpsLatitudePresent === true), true);
  assert.equal(value.bands.every((band) => band.GpsLongitudePresent === true), true);
  assert.equal(value.bands.every((band) => band.RtkFlag === 50), true);

  const encoded = JSON.stringify(value);
  for (const forbidden of [
    "AIRCRAFT-SERIAL-SECRET",
    "CAMERA-SERIAL-SECRET",
    "49.123456",
    "8.123456",
    "123e4567-e89b-42d3-a456-426614174000",
    fixture.dir,
    "green.tif",
    "red.tif",
    "rededge.tif",
    "nir.tif"
  ]) {
    assert.equal(encoded.includes(forbidden), false, `leaked: ${forbidden}`);
  }
});

test("rejects a capture set with mixed CaptureUUID values", () => {
  const fixture = createFixture();
  fixture.metadata[3]["XMP-drone-dji:CaptureUUID"] =
    "223e4567-e89b-42d3-a456-426614174999";
  fs.writeFileSync(fixture.metadataPath, JSON.stringify(fixture.metadata));

  const run = spawnSync(
    process.execPath,
    [
      script,
      "--real-hardware",
      "--metadata-json",
      fixture.metadataPath,
      "--root",
      fixture.dir,
      "--out",
      fixture.outputPath
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CaptureUUID values|one capture set/i);
});

test("requires explicit real-hardware acknowledgement", () => {
  const fixture = createFixture();
  const run = spawnSync(
    process.execPath,
    [
      script,
      "--metadata-json",
      fixture.metadataPath,
      "--root",
      fixture.dir,
      "--out",
      fixture.outputPath
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--real-hardware/);
});
