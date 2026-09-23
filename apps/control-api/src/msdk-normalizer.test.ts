import assert from "node:assert/strict";
import test from "node:test";

import type { MsdkBridgeSnapshot } from "./msdk-bridge.js";
import { normalizeMsdkBridgeSnapshot } from "./msdk-normalizer.js";

function snapshot(): MsdkBridgeSnapshot {
  return {
    schema: "fh2.msdk.v1",
    timestampMs: 1_000,
    sdk: { registered: true, productConnected: true },
    gateway: {
      connected: true,
      serialNumber: "RC-PRO-001",
      firmwareVersion: "01.02",
      rcGpsValid: true,
      rcLatitude: 49.121,
      rcLongitude: 8.581,
      rcAccuracyM: 2.5
    },
    aircraft: {
      flightControllerConnected: true,
      productType: "M3T",
      flightControllerSerial: "M3T-001",
      latitude: 49.12,
      longitude: 8.58,
      altitudeM: 123.4,
      homeLatitude: 49.119,
      homeLongitude: 8.579,
      headingDeg: 187.5
    },
    sensors: [
      {
        index: "LEFT_OR_MAIN",
        cameraConnected: true,
        cameraType: "M3T",
        gimbalConnected: true
      }
    ],
    rtk: {
      enabled: true,
      healthy: true,
      positioningSolution: "FIXED_POINT",
      mobileLatitude: 49.12,
      mobileLongitude: 8.58,
      mobileAltitudeM: 124.1,
      stdLongitude: 0.01,
      stdLatitude: 0.01,
      stdAltitude: 0.02
    },
    payloadControl: {
      cameraIndex: "LEFT_OR_MAIN",
      isShootingPhoto: false,
      isRecording: true,
      lastAction: "start_record"
    },
    wayline: {
      supported: true,
      selectedFileName: "inspection.kmz",
      availableWaylineIds: [0, 1],
      uploadState: "uploaded",
      uploadProgress: 1,
      uploadedAt: 1_500
    },
    control: {
      networkArmed: false,
      networkArmedAt: null,
      virtualStick: {
        enabled: false,
        authorityOwner: "UNKNOWN"
      }
    },
    keyManager: {
      active: true,
      productConnected: true,
      probedAt: 1_000,
      keys: [
        {
          identifier: "ControlMode",
          family: "remote_controller",
          operations: {
            canGet: true,
            canSet: true,
            canListen: false,
            canPerformAction: false
          },
          probeMode: "cache+hardware_read",
          runtimeStatus: "supported"
        }
      ]
    },
    capabilities: {
      camera: true,
      gimbal: true,
      thermal: true,
      multispectral: false,
      rtk: true,
      virtualStick: true
    }
  };
}

test("normalizes MSDK snapshot into common device and telemetry registries", () => {
  const normalized = normalizeMsdkBridgeSnapshot(snapshot(), 2_000);

  assert.equal(normalized.device.adapterId, "msdk-v5");
  assert.equal(normalized.device.identity.id, "M3T-001");
  assert.equal(normalized.device.connected, true);
  assert.equal(
    normalized.device.capabilities.includes("telemetry.flight"),
    true
  );
  assert.equal(
    normalized.device.capabilities.includes("telemetry.rtk"),
    true
  );
  assert.equal(
    normalized.device.capabilities.includes("control.flight"),
    false
  );
  // A writable DJI key remains adapter evidence only. It must not create
  // any FH2 control capability without an explicit routed implementation
  // and the existing safety/authority chain.
  assert.equal(
    normalized.device.capabilities.some((capability) =>
      capability.startsWith("control.")
    ),
    false
  );

  const values = new Map(
    normalized.samples.map((sample) => [sample.key, sample.value])
  );
  assert.equal(values.get("flight.position.latitude_deg"), 49.12);
  assert.equal(values.get("flight.position.longitude_deg"), 8.58);
  assert.equal(values.get("navigation.rtk.fix_status"), "FIXED_POINT");
  assert.deepEqual(values.get("raw.msdk.camera.types"), ["M3T"]);
  assert.equal(values.get("flight.home.latitude_deg"), 49.119);
  assert.equal(values.get("flight.home.longitude_deg"), 8.579);
  assert.equal(values.get("flight.heading_deg"), 187.5);
  assert.equal(values.get("raw.msdk.gateway.gps.latitude_deg"), 49.121);
  assert.equal(values.get("raw.msdk.gateway.gps.accuracy_m"), 2.5);
  assert.equal(
    values.get("raw.msdk.payload_control.is_recording"),
    true
  );
  assert.equal(
    values.get("raw.msdk.payload_control.last_action"),
    "start_record"
  );
  assert.equal(
    values.get("raw.msdk.wayline.upload_state"),
    "uploaded"
  );
  assert.deepEqual(
    values.get("raw.msdk.wayline.available_ids"),
    [0, 1]
  );
});
