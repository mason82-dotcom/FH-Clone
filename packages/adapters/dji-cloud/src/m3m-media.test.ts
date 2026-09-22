import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDjiM3mMediaMetadata,
  sameDjiM3mCapture
} from "./m3m-media.js";

function input(metadata: Record<string, unknown>) {
  return {
    assetId: "asset-1",
    deviceId: "M3M-001",
    sensorId: "camera-1",
    fileName: "sample.tif",
    metadata
  };
}

test("maps authoritative DJI M3M band metadata without filename guessing", () => {
  const result = normalizeDjiM3mMediaMetadata(
    input({
      "drone-dji:BandName": "Red",
      "drone-dji:BandFreq": "650(+/-16)nm",
      "drone-dji:CentralWavelength": 650,
      "drone-dji:SensorIndex": 2,
      "drone-dji:CaptureUUID": "3377fb05-b357-448f-b87b-7023daebbaed",
      "drone-dji:ImageSource": "MS_RED_CAMERA"
    })
  );

  assert.deepEqual(result.asset.band, {
    name: "RED",
    confidence: "authoritative",
    centerNm: 650,
    toleranceNm: 16,
    source: "drone-dji:BandName"
  });
  assert.equal(result.captureUuid, "3377fb05-b357-448f-b87b-7023daebbaed");
  assert.equal(result.asset.sensor.confidence, "authoritative");
  assert.deepEqual(result.conflicts, []);
});

test("never infers a band from filename or sensor index alone", () => {
  const result = normalizeDjiM3mMediaMetadata(
    input({
      SensorIndex: 4,
      fileName: "DJI_0001_NIR.TIF"
    })
  );

  assert.equal(result.asset.band, undefined);
  assert.equal(result.sensorIndex, 4);
});

test("reports authoritative metadata conflicts instead of silently resolving them", () => {
  const result = normalizeDjiM3mMediaMetadata(
    input({
      BandName: "NIR",
      BandFreq: "650(+/-16)nm",
      CentralWavelength: 650,
      SensorIndex: 2
    })
  );

  assert.equal(result.asset.band?.name, "NIR");
  assert.ok(result.conflicts.includes("band_frequency_mismatch"));
  assert.ok(result.conflicts.includes("central_wavelength_mismatch"));
  assert.ok(result.conflicts.includes("sensor_index_mismatch"));
});

test("maps capture context and radiometry while preserving raw metadata", () => {
  const result = normalizeDjiM3mMediaMetadata(
    input({
      DroneSerialNumber: "M3M-001",
      UTCAtExposure: "2023:03:09 02:47:57.725671",
      GpsLatitude: 49.123,
      GpsLongitude: 8.456,
      AbsoluteAltitude: 123.4,
      RelativeAltitude: 40.1,
      FlightYawDegree: 12.5,
      GimbalPitchDegree: -90,
      RtkFlag: 50,
      Irradiance: 2000,
      LS_status: 2,
      RawData: "11682.000 10389.000 12836.000 9945.000",
      SensorGain: 1.044,
      ExposureTime: 1000,
      BlackCurrent: 3200,
      VignettingData: "-0.1,0.2",
      DewarpData: "2022-10-24;...",
      CalibratedHMatrix: "1,0,0,0,1,0,0,0,1"
    })
  );

  assert.equal(result.asset.capture.capturedAt, Date.UTC(2023, 2, 9, 2, 47, 57, 725));
  assert.equal(result.asset.capture.latitudeDeg, 49.123);
  assert.equal(result.asset.capture.longitudeDeg, 8.456);
  assert.equal(result.asset.capture.rtkFixed, true);
  assert.deepEqual(result.radiometry.rawSunlightSensor, [11682, 10389, 12836, 9945]);
  assert.equal(result.radiometry.irradiance, 2000);
  assert.equal(result.radiometry.exposureTimeUs, 1000);
  assert.equal(result.asset.metadata?.RtkFlag, 50);
});

test("flags a device serial mismatch but keeps the explicit import device id", () => {
  const result = normalizeDjiM3mMediaMetadata(
    input({
      DroneSerialNumber: "OTHER-M3M"
    })
  );

  assert.equal(result.asset.capture.deviceId, "M3M-001");
  assert.ok(result.conflicts.includes("device_serial_mismatch"));
});

test("correlates assets only by a non-empty identical CaptureUUID", () => {
  const left = normalizeDjiM3mMediaMetadata(
    input({ CaptureUUID: "capture-a", BandName: "Red" })
  );
  const right = normalizeDjiM3mMediaMetadata({
    ...input({ CaptureUUID: "capture-a", BandName: "NIR" }),
    assetId: "asset-2"
  });
  const other = normalizeDjiM3mMediaMetadata({
    ...input({ CaptureUUID: "capture-b", BandName: "NIR" }),
    assetId: "asset-3"
  });

  assert.equal(sameDjiM3mCapture(left, right), true);
  assert.equal(sameDjiM3mCapture(left, other), false);
});
