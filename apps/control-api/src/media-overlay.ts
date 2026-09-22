import type { MediaAsset, ProcessingProfile, SensorSourceKind } from "@fh-clone/aircraft-core";

export type MediaOverlayLayer = "thermal" | "multispectral";

export interface MediaOverlayPoint {
  id: string;
  layer: MediaOverlayLayer;
  deviceId: string;
  sensorKind: SensorSourceKind;
  profile: ProcessingProfile;
  latitudeDeg: number;
  longitudeDeg: number;
  heightM?: number;
  capturedAt?: number;
  missionId?: string;
  payloadId?: string;
  band?: string;
  fileName?: string;
}

export interface MediaOverlaySnapshot {
  thermal: MediaOverlayPoint[];
  multispectral: MediaOverlayPoint[];
}

export class MediaOverlayRegistry {
  private readonly assets = new Map<string, MediaAsset>();

  upsert(asset: MediaAsset): MediaOverlayPoint | undefined {
    this.assets.set(asset.id, structuredClone(asset));
    return toOverlayPoint(asset);
  }

  remove(assetId: string): boolean {
    return this.assets.delete(assetId);
  }

  list(): MediaOverlaySnapshot {
    const snapshot: MediaOverlaySnapshot = {
      thermal: [],
      multispectral: []
    };

    for (const asset of this.assets.values()) {
      const point = toOverlayPoint(asset);
      if (!point) continue;
      snapshot[point.layer].push(point);
    }

    snapshot.thermal.sort(sortOverlayPoints);
    snapshot.multispectral.sort(sortOverlayPoints);
    return snapshot;
  }

  size(): number {
    return this.assets.size;
  }
}

export function isMediaAsset(value: unknown): value is MediaAsset {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.trim() === "") return false;
  if (!isRecord(value.sensor)) return false;
  if (typeof value.sensor.id !== "string" || value.sensor.id.trim() === "") return false;
  if (!isSensorKind(value.sensor.kind)) return false;
  if (!isSourceConfidence(value.sensor.confidence)) return false;
  if (!isRecord(value.capture)) return false;
  if (typeof value.capture.deviceId !== "string" || value.capture.deviceId.trim() === "") {
    return false;
  }
  if (!isProcessingProfile(value.profile)) return false;

  const lat = value.capture.latitudeDeg;
  const lon = value.capture.longitudeDeg;
  if (lat !== undefined && !finiteInRange(lat, -90, 90)) return false;
  if (lon !== undefined && !finiteInRange(lon, -180, 180)) return false;

  return true;
}

function toOverlayPoint(asset: MediaAsset): MediaOverlayPoint | undefined {
  const latitudeDeg = asset.capture.latitudeDeg;
  const longitudeDeg = asset.capture.longitudeDeg;

  if (
    !finiteInRange(latitudeDeg, -90, 90) ||
    !finiteInRange(longitudeDeg, -180, 180)
  ) {
    return undefined;
  }

  const layer = classifyLayer(asset);
  if (!layer) return undefined;

  const heightM =
    finiteNumber(asset.capture.ellipsoidHeightM) ??
    finiteNumber(asset.capture.relativeHeightM);

  return {
    id: asset.id,
    layer,
    deviceId: asset.capture.deviceId,
    sensorKind: asset.sensor.kind,
    profile: asset.profile,
    latitudeDeg,
    longitudeDeg,
    ...(heightM !== undefined ? { heightM } : {}),
    ...(asset.capture.capturedAt !== undefined
      ? { capturedAt: asset.capture.capturedAt }
      : {}),
    ...(asset.capture.missionId ? { missionId: asset.capture.missionId } : {}),
    ...(asset.capture.payloadId ? { payloadId: asset.capture.payloadId } : {}),
    ...(asset.band?.name ? { band: asset.band.name } : {}),
    ...(asset.fileName ? { fileName: asset.fileName } : {})
  };
}

function classifyLayer(asset: MediaAsset): MediaOverlayLayer | undefined {
  if (
    asset.sensor.kind === "thermal" ||
    asset.profile === "THERMAL" ||
    asset.band?.name === "THERMAL"
  ) {
    return "thermal";
  }

  if (
    asset.sensor.kind === "multispectral" ||
    asset.profile === "MULTISPECTRAL" ||
    asset.profile === "NDVI"
  ) {
    return "multispectral";
  }

  return undefined;
}

function sortOverlayPoints(a: MediaOverlayPoint, b: MediaOverlayPoint): number {
  const timeA = a.capturedAt ?? 0;
  const timeB = b.capturedAt ?? 0;
  return timeB - timeA || a.id.localeCompare(b.id);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProcessingProfile(value: unknown): value is ProcessingProfile {
  return (
    value === "GENERIC" ||
    value === "RGB" ||
    value === "THERMAL" ||
    value === "MULTISPECTRAL" ||
    value === "NDVI"
  );
}

function isSensorKind(value: unknown): value is SensorSourceKind {
  return (
    value === "rgb" ||
    value === "thermal" ||
    value === "multispectral" ||
    value === "unknown"
  );
}

function isSourceConfidence(value: unknown): boolean {
  return (
    value === "authoritative" ||
    value === "derived" ||
    value === "heuristic" ||
    value === "unavailable"
  );
}

function finiteInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
