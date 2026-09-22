import type {
  CaptureContext,
  MediaAsset,
  SourceConfidence,
  SpectralBand,
  SpectralBandName
} from "@fh-clone/aircraft-core";

type Metadata = Record<string, unknown>;

export interface DjiM3mMediaInput {
  assetId: string;
  deviceId: string;
  sensorId: string;
  metadata: Metadata;
  fileName?: string;
  objectKey?: string;
}

export interface DjiM3mRadiometryMetadata {
  irradiance?: number;
  sunlightSensorStatus?: number;
  rawSunlightSensor?: number[];
  sensorGain?: number;
  sensorGainAdjustment?: number;
  exposureTimeUs?: number;
  blackLevel?: number;
  vignettingData?: string;
  dewarpData?: string;
  calibratedHMatrix?: string;
}

export interface DjiM3mMediaNormalization {
  asset: MediaAsset;
  captureUuid?: string;
  imageSource?: string;
  sensorIndex?: number;
  bandFrequency?: string;
  centralWavelengthNm?: number;
  radiometry: DjiM3mRadiometryMetadata;
  conflicts: string[];
  sourceKeys: Record<string, string>;
}

interface BandContract {
  name: SpectralBandName;
  centerNm: number;
  toleranceNm: number;
  sensorIndex: number;
}

const BAND_BY_DJI_NAME: Record<string, BandContract> = {
  Green: { name: "GREEN", centerNm: 560, toleranceNm: 16, sensorIndex: 1 },
  Red: { name: "RED", centerNm: 650, toleranceNm: 16, sensorIndex: 2 },
  RedEdge: { name: "RED_EDGE", centerNm: 730, toleranceNm: 16, sensorIndex: 3 },
  NIR: { name: "NIR", centerNm: 860, toleranceNm: 26, sensorIndex: 4 }
};

function localName(key: string): string {
  const afterColon = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
  return afterColon.startsWith("XMP-") ? afterColon.slice(4) : afterColon;
}

function findTag(
  metadata: Metadata,
  name: string
): { key: string; value: unknown } | undefined {
  const exact = Object.entries(metadata).filter(([key]) => localName(key) === name);
  if (exact.length !== 1) return undefined;
  const [key, value] = exact[0]!;
  return { key, value };
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function integerValue(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function numericList(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(numberValue);
    return values.every((item): item is number => item !== undefined) ? values : undefined;
  }
  if (typeof value !== "string") return undefined;
  const values = value
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((item) => Number(item));
  return values.length > 0 && values.every(Number.isFinite) ? values : undefined;
}

function parseUtcAtExposure(value: unknown): number | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const match = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(text);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const millis = Number((fraction + "000").slice(0, 3));
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    millis
  );
}

function parseBandFrequency(value: unknown): { centerNm: number; toleranceNm: number } | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*\(\s*(?:\+\/-|±)\s*(\d+(?:\.\d+)?)\s*\)\s*nm$/i.exec(text);
  if (!match) return undefined;
  return { centerNm: Number(match[1]), toleranceNm: Number(match[2]) };
}

function assignNumber(
  metadata: Metadata,
  sourceKeys: Record<string, string>,
  name: string
): number | undefined {
  const tag = findTag(metadata, name);
  if (!tag) return undefined;
  const value = numberValue(tag.value);
  if (value !== undefined) sourceKeys[name] = tag.key;
  return value;
}

function assignInteger(
  metadata: Metadata,
  sourceKeys: Record<string, string>,
  name: string
): number | undefined {
  const tag = findTag(metadata, name);
  if (!tag) return undefined;
  const value = integerValue(tag.value);
  if (value !== undefined) sourceKeys[name] = tag.key;
  return value;
}

function assignText(
  metadata: Metadata,
  sourceKeys: Record<string, string>,
  name: string
): string | undefined {
  const tag = findTag(metadata, name);
  if (!tag) return undefined;
  const value = textValue(tag.value);
  if (value !== undefined) sourceKeys[name] = tag.key;
  return value;
}

function buildBand(
  metadata: Metadata,
  sourceKeys: Record<string, string>,
  conflicts: string[]
): SpectralBand | undefined {
  const bandName = assignText(metadata, sourceKeys, "BandName");
  if (!bandName) return undefined;

  const contract = BAND_BY_DJI_NAME[bandName];
  if (!contract) {
    conflicts.push("unsupported_band_name");
    const source = sourceKeys.BandName;
    return {
      name: "UNKNOWN",
      confidence: "authoritative",
      ...(source ? { source } : {})
    };
  }

  const frequencyTag = findTag(metadata, "BandFreq");
  const parsedFrequency = frequencyTag ? parseBandFrequency(frequencyTag.value) : undefined;
  if (frequencyTag && parsedFrequency) {
    sourceKeys.BandFreq = frequencyTag.key;
    if (
      parsedFrequency.centerNm !== contract.centerNm ||
      parsedFrequency.toleranceNm !== contract.toleranceNm
    ) {
      conflicts.push("band_frequency_mismatch");
    }
  }

  const centralWavelength = assignNumber(metadata, sourceKeys, "CentralWavelength");
  if (
    centralWavelength !== undefined &&
    centralWavelength !== contract.centerNm
  ) {
    conflicts.push("central_wavelength_mismatch");
  }

  const sensorIndex = assignInteger(metadata, sourceKeys, "SensorIndex");
  if (sensorIndex !== undefined && sensorIndex !== contract.sensorIndex) {
    conflicts.push("sensor_index_mismatch");
  }

  const source = sourceKeys.BandName;
  return {
    name: contract.name,
    confidence: "authoritative",
    centerNm: contract.centerNm,
    toleranceNm: contract.toleranceNm,
    ...(source ? { source } : {})
  };
}

function buildCaptureContext(
  input: DjiM3mMediaInput,
  sourceKeys: Record<string, string>,
  conflicts: string[]
): CaptureContext {
  const metadata = input.metadata;
  const droneSerial = assignText(metadata, sourceKeys, "DroneSerialNumber");
  if (droneSerial && droneSerial !== input.deviceId) {
    conflicts.push("device_serial_mismatch");
  }

  const capturedAtTag = findTag(metadata, "UTCAtExposure");
  const capturedAt = capturedAtTag ? parseUtcAtExposure(capturedAtTag.value) : undefined;
  if (capturedAtTag && capturedAt !== undefined) sourceKeys.UTCAtExposure = capturedAtTag.key;

  const rtkFlag = assignInteger(metadata, sourceKeys, "RtkFlag");
  const latitudeDeg = assignNumber(metadata, sourceKeys, "GpsLatitude");
  const longitudeDeg = assignNumber(metadata, sourceKeys, "GpsLongitude");
  const ellipsoidHeightM = assignNumber(metadata, sourceKeys, "AbsoluteAltitude");
  const relativeHeightM = assignNumber(metadata, sourceKeys, "RelativeAltitude");
  const aircraftYawDeg = assignNumber(metadata, sourceKeys, "FlightYawDegree");
  const aircraftPitchDeg = assignNumber(metadata, sourceKeys, "FlightPitchDegree");
  const aircraftRollDeg = assignNumber(metadata, sourceKeys, "FlightRollDegree");
  const gimbalYawDeg = assignNumber(metadata, sourceKeys, "GimbalYawDegree");
  const gimbalPitchDeg = assignNumber(metadata, sourceKeys, "GimbalPitchDegree");
  const gimbalRollDeg = assignNumber(metadata, sourceKeys, "GimbalRollDegree");

  return {
    deviceId: input.deviceId,
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(latitudeDeg !== undefined ? { latitudeDeg } : {}),
    ...(longitudeDeg !== undefined ? { longitudeDeg } : {}),
    ...(ellipsoidHeightM !== undefined ? { ellipsoidHeightM } : {}),
    ...(relativeHeightM !== undefined ? { relativeHeightM } : {}),
    ...(aircraftYawDeg !== undefined ? { aircraftYawDeg } : {}),
    ...(aircraftPitchDeg !== undefined ? { aircraftPitchDeg } : {}),
    ...(aircraftRollDeg !== undefined ? { aircraftRollDeg } : {}),
    ...(gimbalYawDeg !== undefined ? { gimbalYawDeg } : {}),
    ...(gimbalPitchDeg !== undefined ? { gimbalPitchDeg } : {}),
    ...(gimbalRollDeg !== undefined ? { gimbalRollDeg } : {}),
    ...(rtkFlag !== undefined ? { rtkFixed: rtkFlag === 50 } : {})
  };
}

export function normalizeDjiM3mMediaMetadata(
  input: DjiM3mMediaInput
): DjiM3mMediaNormalization {
  const sourceKeys: Record<string, string> = {};
  const conflicts: string[] = [];
  const band = buildBand(input.metadata, sourceKeys, conflicts);
  const capture = buildCaptureContext(input, sourceKeys, conflicts);

  const captureUuid = assignText(input.metadata, sourceKeys, "CaptureUUID");
  const imageSource = assignText(input.metadata, sourceKeys, "ImageSource");
  const sensorIndex = assignInteger(input.metadata, sourceKeys, "SensorIndex");
  const bandFrequency = assignText(input.metadata, sourceKeys, "BandFreq");
  const centralWavelengthNm = assignNumber(input.metadata, sourceKeys, "CentralWavelength");

  const rawSunlightTag = findTag(input.metadata, "RawData");
  const rawSunlightSensor = rawSunlightTag ? numericList(rawSunlightTag.value) : undefined;
  if (rawSunlightTag && rawSunlightSensor) sourceKeys.RawData = rawSunlightTag.key;

  const irradiance = assignNumber(input.metadata, sourceKeys, "Irradiance");
  const sunlightSensorStatus = assignInteger(input.metadata, sourceKeys, "LS_status");
  const sensorGain = assignNumber(input.metadata, sourceKeys, "SensorGain");
  const sensorGainAdjustment = assignNumber(
    input.metadata,
    sourceKeys,
    "SensorGainAdjustment"
  );
  const exposureTimeUs = assignNumber(input.metadata, sourceKeys, "ExposureTime");
  const blackLevel = assignNumber(input.metadata, sourceKeys, "BlackCurrent");
  const vignettingData = assignText(input.metadata, sourceKeys, "VignettingData");
  const dewarpData = assignText(input.metadata, sourceKeys, "DewarpData");
  const calibratedHMatrix = assignText(
    input.metadata,
    sourceKeys,
    "CalibratedHMatrix"
  );

  const radiometry: DjiM3mRadiometryMetadata = {
    ...(irradiance !== undefined ? { irradiance } : {}),
    ...(sunlightSensorStatus !== undefined ? { sunlightSensorStatus } : {}),
    ...(rawSunlightSensor ? { rawSunlightSensor } : {}),
    ...(sensorGain !== undefined ? { sensorGain } : {}),
    ...(sensorGainAdjustment !== undefined ? { sensorGainAdjustment } : {}),
    ...(exposureTimeUs !== undefined ? { exposureTimeUs } : {}),
    ...(blackLevel !== undefined ? { blackLevel } : {}),
    ...(vignettingData ? { vignettingData } : {}),
    ...(dewarpData ? { dewarpData } : {}),
    ...(calibratedHMatrix ? { calibratedHMatrix } : {})
  };

  const sensorConfidence: SourceConfidence =
    imageSource?.startsWith("MS_") ? "authoritative" : "derived";

  const asset: MediaAsset = {
    id: input.assetId,
    ...(input.objectKey ? { objectKey: input.objectKey } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    sensor: {
      id: input.sensorId,
      kind: "multispectral",
      confidence: sensorConfidence,
      ...(imageSource ? { label: imageSource } : {})
    },
    ...(band ? { band } : {}),
    capture,
    profile: "MULTISPECTRAL",
    metadata: { ...input.metadata }
  };

  return {
    asset,
    ...(captureUuid ? { captureUuid } : {}),
    ...(imageSource ? { imageSource } : {}),
    ...(sensorIndex !== undefined ? { sensorIndex } : {}),
    ...(bandFrequency ? { bandFrequency } : {}),
    ...(centralWavelengthNm !== undefined ? { centralWavelengthNm } : {}),
    radiometry,
    conflicts: [...new Set(conflicts)],
    sourceKeys
  };
}

export function sameDjiM3mCapture(
  left: Pick<DjiM3mMediaNormalization, "captureUuid">,
  right: Pick<DjiM3mMediaNormalization, "captureUuid">
): boolean {
  return Boolean(left.captureUuid && right.captureUuid && left.captureUuid === right.captureUuid);
}
