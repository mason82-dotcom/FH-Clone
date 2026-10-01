import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { normalizeDjiM3mMediaMetadata } from "../packages/adapters/dji-cloud/dist/m3m-media.js";

function fail(message) {
  console.error(`M3M_CAPTURE_EVIDENCE_ERROR: ${message}`);
  process.exit(1);
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localName(key) {
  const afterColon = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
  return afterColon.startsWith("XMP-") ? afterColon.slice(4) : afterColon;
}

function tag(metadata, name) {
  const matches = Object.entries(metadata).filter(([key]) => localName(key) === name);
  if (matches.length > 1) {
    fail(`ambiguous metadata tag ${name}: ${matches.map(([key]) => key).join(", ")}`);
  }
  return matches[0]?.[1];
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function hashFile(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function requireNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`missing or invalid ${label}`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`missing or invalid ${label}`);
  }
  return value;
}

function main() {
  const args = process.argv.slice(2);
  const realIndex = args.indexOf("--real-hardware");
  if (realIndex < 0) fail("use --real-hardware explicitly for a real M3M capture");
  args.splice(realIndex, 1);

  const metadataArg = option(args, "--metadata-json");
  if (!metadataArg) fail("use --metadata-json <exiftool.json>");

  const rootArg = option(args, "--root");
  const outArg = option(args, "--out");
  if (args.length) fail(`unexpected arguments: ${args.join(" ")}`);

  const metadataPath = path.resolve(metadataArg);
  const root = path.resolve(rootArg ?? path.dirname(metadataPath));
  const outputPath = path.resolve(outArg ?? "docs/fixtures/m3m/capture-set.json");

  let rows;
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    rows = Array.isArray(parsed) ? parsed.filter(record) : [];
  } catch (error) {
    fail(`cannot read metadata JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!rows.length) fail("ExifTool JSON contains no metadata records");

  const narrowBands = [];
  const sensitiveStrings = [];

  for (const metadata of rows) {
    const sourceFile = text(tag(metadata, "SourceFile"));
    if (!sourceFile) fail("every ExifTool record must contain SourceFile");

    const sourcePath = path.isAbsolute(sourceFile)
      ? sourceFile
      : path.resolve(root, sourceFile);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      fail(`source file not found: ${sourceFile}`);
    }

    const droneSerial =
      text(tag(metadata, "DroneSerialNumber")) ??
      text(tag(metadata, "DroneID")) ??
      "DEVICE_REDACTED";
    const cameraSerial =
      text(tag(metadata, "CameraSerialNumber")) ??
      text(tag(metadata, "ImageSource")) ??
      "SENSOR_REDACTED";

    const normalized = normalizeDjiM3mMediaMetadata({
      assetId: hashFile(sourcePath),
      deviceId: droneSerial,
      sensorId: cameraSerial,
      metadata
    });

    const band = normalized.asset.band?.name;
    if (!["GREEN", "RED", "RED_EDGE", "NIR"].includes(band ?? "")) {
      continue;
    }

    if (normalized.conflicts.length) {
      fail(`metadata conflicts for ${sourceFile}: ${normalized.conflicts.join(", ")}`);
    }
    if (!normalized.captureUuid) fail(`missing CaptureUUID for ${sourceFile}`);
    if (!normalized.bandFrequency) fail(`missing BandFreq for ${sourceFile}`);
    if (normalized.sensorIndex === undefined) fail(`missing SensorIndex for ${sourceFile}`);
    if (normalized.asset.capture.capturedAt === undefined) {
      fail(`missing UTCAtExposure for ${sourceFile}`);
    }

    const irradiance = requireNumber(normalized.radiometry.irradiance, "Irradiance");
    const sensorGain = requireNumber(normalized.radiometry.sensorGain, "SensorGain");
    const sensorGainAdjustment = requireNumber(
      normalized.radiometry.sensorGainAdjustment,
      "SensorGainAdjustment"
    );
    const exposureTime = requireNumber(normalized.radiometry.exposureTimeUs, "ExposureTime");
    const rawData = requireArray(normalized.radiometry.rawSunlightSensor, "RawData");

    const rtkFlag = finite(tag(metadata, "RtkFlag"));
    if (rtkFlag === undefined) fail(`missing RtkFlag for ${sourceFile}`);

    const capture = normalized.asset.capture;
    const pose = {
      FlightRollDegree: requireNumber(capture.aircraftRollDeg, "FlightRollDegree"),
      FlightPitchDegree: requireNumber(capture.aircraftPitchDeg, "FlightPitchDegree"),
      FlightYawDegree: requireNumber(capture.aircraftYawDeg, "FlightYawDegree"),
      GimbalRollDegree: requireNumber(capture.gimbalRollDeg, "GimbalRollDegree"),
      GimbalPitchDegree: requireNumber(capture.gimbalPitchDeg, "GimbalPitchDegree"),
      GimbalYawDegree: requireNumber(capture.gimbalYawDeg, "GimbalYawDegree")
    };

    const rawBandName = text(tag(metadata, "BandName"));
    if (!rawBandName) fail(`missing BandName for ${sourceFile}`);

    const calibration = {
      ...(normalized.radiometry.vignettingData !== undefined
        ? { VignettingData: normalized.radiometry.vignettingData }
        : {}),
      ...(normalized.radiometry.dewarpData !== undefined
        ? { DewarpData: normalized.radiometry.dewarpData }
        : {}),
      ...(normalized.radiometry.calibratedHMatrix !== undefined
        ? { CalibratedHMatrix: normalized.radiometry.calibratedHMatrix }
        : {})
    };
    if (!Object.keys(calibration).length) {
      fail(`no calibration metadata observed for ${sourceFile}`);
    }

    const captureUuidSha256 = sha256Text(normalized.captureUuid);
    const sample = {
      sourceSha256: hashFile(sourcePath),
      BandName: rawBandName,
      BandFreq: normalized.bandFrequency,
      SensorIndex: normalized.sensorIndex,
      CaptureUUID: `sha256:${captureUuidSha256}`,
      UTCAtExposure: new Date(capture.capturedAt).toISOString(),
      ...(normalized.imageSource ? { ImageSource: normalized.imageSource } : {}),
      Irradiance: irradiance,
      ...(normalized.radiometry.sunlightSensorStatus !== undefined
        ? { LS_status: normalized.radiometry.sunlightSensorStatus }
        : {}),
      SensorGain: sensorGain,
      SensorGainAdjustment: sensorGainAdjustment,
      ExposureTime: exposureTime,
      RawData: rawData,
      ...(normalized.radiometry.blackLevel !== undefined
        ? { BlackLevel: normalized.radiometry.blackLevel }
        : {}),
      ...calibration,
      GpsLatitudePresent: capture.latitudeDeg !== undefined,
      GpsLongitudePresent: capture.longitudeDeg !== undefined,
      AbsoluteAltitudePresent: capture.ellipsoidHeightM !== undefined,
      RelativeAltitudePresent: capture.relativeHeightM !== undefined,
      RtkFlag: rtkFlag,
      RtkFixed: capture.rtkFixed === true,
      ...pose
    };

    if (!sample.GpsLatitudePresent || !sample.GpsLongitudePresent) {
      fail(`missing GPS coordinates in source metadata for ${sourceFile}`);
    }

    narrowBands.push({
      rawCaptureUuid: normalized.captureUuid,
      sample
    });

    for (const value of [
      sourceFile,
      text(tag(metadata, "DroneSerialNumber")),
      text(tag(metadata, "DroneID")),
      text(tag(metadata, "CameraSerialNumber")),
      String(tag(metadata, "GpsLatitude") ?? ""),
      String(tag(metadata, "GpsLongitude") ?? ""),
      normalized.captureUuid
    ]) {
      if (value) sensitiveStrings.push(value);
    }
  }

  if (narrowBands.length !== 4) {
    fail(`expected exactly four narrow-band records, observed ${narrowBands.length}`);
  }

  const expectedBands = new Map([
    ["Green", 1],
    ["Red", 2],
    ["RedEdge", 3],
    ["NIR", 4]
  ]);
  for (const [name, sensorIndex] of expectedBands) {
    const matching = narrowBands.filter(({ sample }) => sample.BandName === name);
    if (matching.length !== 1) fail(`expected exactly one ${name} band`);
    if (matching[0].sample.SensorIndex !== sensorIndex) {
      fail(`${name} SensorIndex must be ${sensorIndex}`);
    }
  }

  const rawCaptureUuids = new Set(narrowBands.map((entry) => entry.rawCaptureUuid));
  if (rawCaptureUuids.size !== 1) {
    fail(`capture contains ${rawCaptureUuids.size} CaptureUUID values; narrow input to one capture set`);
  }

  const order = new Map([["Green", 0], ["Red", 1], ["RedEdge", 2], ["NIR", 3]]);
  const bands = narrowBands
    .map((entry) => entry.sample)
    .sort((a, b) => order.get(a.BandName) - order.get(b.BandName));

  const output = {
    schema: "fh2.m3m-capture.v1",
    realHardware: true,
    synthetic: false,
    redacted: true,
    generatedFrom: "ExifTool JSON + FH2 M3M normalizer",
    sourceSetSha256: sha256Text(
      bands.map((band) => band.sourceSha256).sort().join("\n")
    ),
    sourceSummary: {
      inputRecords: rows.length,
      narrowBandRecords: bands.length,
      ignoredRecords: rows.length - bands.length
    },
    bands
  };

  const encoded = JSON.stringify(output);
  for (const value of sensitiveStrings) {
    if (value.length >= 4 && encoded.includes(value)) {
      fail("sanitization failure: sensitive source value leaked into public fixture");
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });

  console.log("M3M_CAPTURE_EVIDENCE_EXPORT=OK");
  console.log(`OUTPUT=${outputPath}`);
  console.log(`SOURCE_SET_SHA256=${output.sourceSetSha256}`);
  console.log(`INPUT_RECORDS=${rows.length}`);
  console.log(`NARROW_BAND_RECORDS=${bands.length}`);
}

main();
