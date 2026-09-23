import type {
  AdapterDevice,
  Capability,
  ParameterSample
} from "@fh-clone/aircraft-core";
import type { MsdkBridgeSnapshot } from "./msdk-bridge.js";

export interface NormalizedMsdkSnapshot {
  device: AdapterDevice;
  samples: ParameterSample[];
}

export function normalizeMsdkBridgeSnapshot(
  snapshot: MsdkBridgeSnapshot,
  sampledAt: number
): NormalizedMsdkSnapshot {
  const deviceId = snapshot.aircraft.flightControllerSerial;
  const capabilities = new Set<Capability>(["telemetry.flight"]);

  if (snapshot.capabilities.camera) capabilities.add("telemetry.camera");
  if (snapshot.capabilities.gimbal) capabilities.add("telemetry.gimbal");
  if (snapshot.capabilities.rtk) capabilities.add("telemetry.rtk");

  const samples: ParameterSample[] = [];
  pushNumber(
    samples,
    deviceId,
    "flight.position.latitude_deg",
    snapshot.aircraft.latitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "flight.position.longitude_deg",
    snapshot.aircraft.longitude,
    sampledAt,
    "deg"
  );

  pushNumber(
    samples,
    deviceId,
    "flight.home.latitude_deg",
    snapshot.aircraft.homeLatitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "flight.home.longitude_deg",
    snapshot.aircraft.homeLongitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "flight.heading_deg",
    snapshot.aircraft.headingDeg,
    sampledAt,
    "deg"
  );

  // MSDK LocationCoordinate3D altitude semantics are kept raw until the
  // installation-specific datum/relative-height contract is verified.
  pushNumber(
    samples,
    deviceId,
    "raw.msdk.flight.location.altitude_m",
    snapshot.aircraft.altitudeM,
    sampledAt,
    "m"
  );

  pushValue(
    samples,
    deviceId,
    "raw.msdk.product.type",
    snapshot.aircraft.productType,
    sampledAt
  );
  pushValue(
    samples,
    deviceId,
    "raw.msdk.gateway.serial_number",
    snapshot.gateway.serialNumber,
    sampledAt
  );

  pushValue(
    samples,
    deviceId,
    "raw.msdk.gateway.gps.valid",
    snapshot.gateway.rcGpsValid,
    sampledAt
  );
  pushNumber(
    samples,
    deviceId,
    "raw.msdk.gateway.gps.latitude_deg",
    snapshot.gateway.rcLatitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "raw.msdk.gateway.gps.longitude_deg",
    snapshot.gateway.rcLongitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "raw.msdk.gateway.gps.accuracy_m",
    snapshot.gateway.rcAccuracyM,
    sampledAt,
    "m"
  );

  const cameraTypes = snapshot.sensors
    .map((entry) => isRecord(entry) ? entry.cameraType : undefined)
    .filter((entry): entry is string => typeof entry === "string");
  if (cameraTypes.length > 0) {
    pushValue(
      samples,
      deviceId,
      "raw.msdk.camera.types",
      [...new Set(cameraTypes)],
      sampledAt
    );
  }

  pushValue(
    samples,
    deviceId,
    "navigation.rtk.enabled",
    snapshot.rtk.enabled,
    sampledAt
  );
  pushValue(
    samples,
    deviceId,
    "navigation.rtk.healthy",
    snapshot.rtk.healthy,
    sampledAt
  );
  pushValue(
    samples,
    deviceId,
    "navigation.rtk.fix_status",
    snapshot.rtk.positioningSolution,
    sampledAt
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.position.latitude_deg",
    snapshot.rtk.mobileLatitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.position.longitude_deg",
    snapshot.rtk.mobileLongitude,
    sampledAt,
    "deg"
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.position.altitude_m",
    snapshot.rtk.mobileAltitudeM,
    sampledAt,
    "m"
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.std.longitude_m",
    snapshot.rtk.stdLongitude,
    sampledAt,
    "m"
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.std.latitude_m",
    snapshot.rtk.stdLatitude,
    sampledAt,
    "m"
  );
  pushNumber(
    samples,
    deviceId,
    "navigation.rtk.std.altitude_m",
    snapshot.rtk.stdAltitude,
    sampledAt,
    "m"
  );


  if (snapshot.payloadControl) {
    pushValue(
      samples,
      deviceId,
      "raw.msdk.payload_control.camera_index",
      snapshot.payloadControl.cameraIndex,
      sampledAt
    );
    pushValue(
      samples,
      deviceId,
      "raw.msdk.payload_control.is_shooting_photo",
      snapshot.payloadControl.isShootingPhoto,
      sampledAt
    );
    pushValue(
      samples,
      deviceId,
      "raw.msdk.payload_control.is_recording",
      snapshot.payloadControl.isRecording,
      sampledAt
    );
    pushValue(
      samples,
      deviceId,
      "raw.msdk.payload_control.last_action",
      snapshot.payloadControl.lastAction,
      sampledAt
    );
  }

  return {
    device: {
      identity: {
        id: deviceId,
        vendor: "DJI",
        serialNumber: deviceId,
        model: snapshot.aircraft.productType,
        productType: snapshot.aircraft.productType
      },
      adapterId: "msdk-v5",
      capabilities: [...capabilities],
      connected:
        snapshot.sdk.registered &&
        snapshot.sdk.productConnected &&
        snapshot.gateway.connected &&
        snapshot.aircraft.flightControllerConnected,
      lastSeenAt: sampledAt
    },
    samples
  };
}

function pushNumber(
  samples: ParameterSample[],
  deviceId: string,
  key: string,
  value: unknown,
  sampledAt: number,
  unit: string
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  samples.push({
    adapterId: "msdk-v5",
    deviceId,
    key,
    rawKey: key,
    value,
    unit,
    sampledAt,
    quality: "good"
  });
}

function pushValue(
  samples: ParameterSample[],
  deviceId: string,
  key: string,
  value: unknown,
  sampledAt: number
): void {
  if (value === undefined || value === null) return;
  samples.push({
    adapterId: "msdk-v5",
    deviceId,
    key,
    rawKey: key,
    value,
    sampledAt,
    quality: "good"
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
