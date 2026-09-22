import { useEffect, useMemo, useRef, useState } from "react";

import { useRtkLive } from "../hooks/useRtkLive.js";
import {
  Fh2CesiumOverlayBridge,
  clearFh2OverlayProducer,
  getFh2OverlaySnapshot,
  setFh2OverlayFeatures,
  subscribeFh2Overlays,
  type Fh2CesiumViewer,
  type Fh2OverlayFeature,
  type Fh2OverlayKind,
  type Fh2OverlaySnapshot
} from "./overlays.js";
import { useFh2CesiumViewer } from "./useFh2CesiumViewer.js";

export interface Fh2OverlayTopology {
  gatewaySn: string;
  product: {
    type: number;
    subType: number;
  };
  subDevices: Array<{
    sn: string;
    product: {
      type: number;
      subType: number;
    };
  }>;
}

interface ParameterSample {
  value: unknown;
}

type TelemetrySnapshot = Record<string, ParameterSample>;

interface AircraftPosition {
  longitudeDeg: number;
  latitudeDeg: number;
  heightM?: number;
}

interface MediaOverlayPoint {
  id: string;
  layer: "thermal" | "multispectral";
  deviceId: string;
  sensorKind: string;
  profile: string;
  latitudeDeg: number;
  longitudeDeg: number;
  heightM?: number;
  capturedAt?: number;
  missionId?: string;
  payloadId?: string;
  band?: string;
  fileName?: string;
}

interface MediaOverlayResponse {
  thermal: MediaOverlayPoint[];
  multispectral: MediaOverlayPoint[];
}

interface UgcsRoutePoint {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeM?: number;
  aglAltitudeM?: number;
}

interface UgcsRoute {
  id: string;
  name: string;
  segments?: Array<{
    id?: string;
    figureType?: string;
    points: UgcsRoutePoint[];
  }>;
}

interface UgcsTelemetryValue {
  time?: number;
  value: unknown;
  semantic?: string;
  subsystem?: string;
  code?: string;
}

type UgcsTelemetrySnapshot = Record<
  string,
  Record<string, UgcsTelemetryValue>
>;

const OVERLAY_KINDS: readonly Fh2OverlayKind[] = [
  "rtk",
  "thermal",
  "multispectral",
  "ugcs"
];

const OVERLAY_LABELS: Record<Fh2OverlayKind, string> = {
  rtk: "RTK",
  thermal: "Thermal",
  multispectral: "Multispektral",
  ugcs: "UgCS"
};

export function Fh2OverlayController({
  topology
}: {
  topology: readonly Fh2OverlayTopology[];
}) {
  const rawViewer = useFh2CesiumViewer("global");
  const viewer = isCesiumViewer(rawViewer) ? rawViewer : undefined;
  const { devices: rtkDevices } = useRtkLive();
  const positions = useAircraftPositions(topology);
  const [snapshot, setSnapshot] = useState<Fh2OverlaySnapshot>(
    getFh2OverlaySnapshot
  );
  const [enabled, setEnabled] = useState<Record<Fh2OverlayKind, boolean>>({
    rtk: true,
    thermal: true,
    multispectral: true,
    ugcs: true
  });
  const bridgeRef = useRef<Fh2CesiumOverlayBridge | undefined>(undefined);

  useEffect(() => subscribeFh2Overlays(setSnapshot), []);

  useMediaOverlayFeed();
  useUgcsOverlayFeed();

  useEffect(() => {
    const features: Fh2OverlayFeature[] = rtkDevices.flatMap((status) => {
      const position = positions[status.deviceId];
      if (!position) return [];

      const fixLabel = status.isFixed ? "FIX" : status.fixState.toUpperCase();
      const satellites =
        status.rtkSatellites !== undefined
          ? ` · ${status.rtkSatellites} RTK-Sat`
          : "";

      return [
        {
          type: "point",
          id: status.deviceId,
          position,
          label: `RTK ${fixLabel}${satellites} · ${status.deviceId}`,
          description: [
            `Gerät: ${status.deviceId}`,
            `RTK: ${fixLabel}`,
            `RTK-Satelliten: ${status.rtkSatellites ?? "–"}`,
            `GPS-Satelliten: ${status.gpsSatellites ?? "–"}`,
            `Alter: ${status.ageMs} ms`
          ].join("<br>")
        } satisfies Fh2OverlayFeature
      ];
    });

    setFh2OverlayFeatures("rtk", "fh2-live-rtk", features);
    return () => clearFh2OverlayProducer("rtk", "fh2-live-rtk");
  }, [positions, rtkDevices]);

  useEffect(() => {
    const m4tDeviceIds = topology.flatMap((gateway) =>
      gateway.subDevices
        .filter(
          (device) =>
            device.product.type === 99 &&
            device.product.subType === 1
        )
        .map((device) => device.sn)
    );

    const features: Fh2OverlayFeature[] = m4tDeviceIds.flatMap((deviceId) => {
      const position = positions[deviceId];
      if (!position) return [];

      return [
        {
          type: "point",
          id: deviceId,
          position,
          label: `M4T Thermal · ${deviceId}`,
          description:
            "Matrice 4T Sensorträger. Dieser Layer markiert die reale Aircraft-Position; es werden ohne Media-/Radiometrie-Feed keine Temperaturflächen erfunden."
        } satisfies Fh2OverlayFeature
      ];
    });

    setFh2OverlayFeatures("thermal", "m4t-platform", features);
    return () => clearFh2OverlayProducer("thermal", "m4t-platform");
  }, [positions, topology]);


function useMediaOverlayFeed(): void {
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/media/overlays", {
          headers: { accept: "application/json" }
        });
        if (!response.ok) throw new Error(`media overlays HTTP ${response.status}`);

        const data = (await response.json()) as MediaOverlayResponse;
        if (cancelled) return;

        setFh2OverlayFeatures(
          "thermal",
          "media-captures",
          toMediaFeatures(data.thermal ?? [])
        );
        setFh2OverlayFeatures(
          "multispectral",
          "media-captures",
          toMediaFeatures(data.multispectral ?? [])
        );
      } catch {
        if (cancelled) return;
        clearFh2OverlayProducer("thermal", "media-captures");
        clearFh2OverlayProducer("multispectral", "media-captures");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      clearFh2OverlayProducer("thermal", "media-captures");
      clearFh2OverlayProducer("multispectral", "media-captures");
    };
  }, []);
}

function useUgcsOverlayFeed(): void {
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [routesResponse, telemetryResponse] = await Promise.all([
          fetch("/api/ugcs/routes", { headers: { accept: "application/json" } }),
          fetch("/api/ugcs/telemetry", { headers: { accept: "application/json" } })
        ]);

        if (!routesResponse.ok || !telemetryResponse.ok) {
          throw new Error("UgCS bridge unavailable");
        }

        const routes = (await routesResponse.json()) as UgcsRoute[];
        const telemetry =
          (await telemetryResponse.json()) as UgcsTelemetrySnapshot;

        if (cancelled) return;

        setFh2OverlayFeatures("ugcs", "routes", toUgcsRouteFeatures(routes));
        setFh2OverlayFeatures(
          "ugcs",
          "vehicles",
          toUgcsTelemetryFeatures(telemetry)
        );
      } catch {
        if (cancelled) return;
        clearFh2OverlayProducer("ugcs", "routes");
        clearFh2OverlayProducer("ugcs", "vehicles");
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      clearFh2OverlayProducer("ugcs", "routes");
      clearFh2OverlayProducer("ugcs", "vehicles");
    };
  }, []);
}

function toMediaFeatures(
  points: readonly MediaOverlayPoint[]
): Fh2OverlayFeature[] {
  return points.map((point) => ({
    type: "point",
    id: point.id,
    position: {
      longitudeDeg: point.longitudeDeg,
      latitudeDeg: point.latitudeDeg,
      ...(point.heightM !== undefined ? { heightM: point.heightM } : {})
    },
    label:
      point.layer === "thermal"
        ? `Thermal · ${point.deviceId}`
        : `${point.profile} · ${point.deviceId}`,
    description: [
      `Asset: ${point.id}`,
      `Gerät: ${point.deviceId}`,
      `Profil: ${point.profile}`,
      point.band ? `Band: ${point.band}` : undefined,
      point.fileName ? `Datei: ${point.fileName}` : undefined,
      point.payloadId ? `Payload: ${point.payloadId}` : undefined,
      point.missionId ? `Mission: ${point.missionId}` : undefined,
      point.capturedAt
        ? `Aufnahme: ${new Date(point.capturedAt).toISOString()}`
        : undefined
    ]
      .filter((value): value is string => Boolean(value))
      .join("<br>")
  }));
}

function toUgcsRouteFeatures(
  routes: readonly UgcsRoute[]
): Fh2OverlayFeature[] {
  const features: Fh2OverlayFeature[] = [];

  for (const route of routes) {
    for (const [segmentIndex, segment] of (route.segments ?? []).entries()) {
      const positions = segment.points
        .filter(
          (point) =>
            Number.isFinite(point.latitudeDeg) &&
            Number.isFinite(point.longitudeDeg)
        )
        .map((point) => ({
          latitudeDeg: point.latitudeDeg,
          longitudeDeg: point.longitudeDeg,
          ...(point.altitudeM !== undefined
            ? { heightM: point.altitudeM }
            : {})
        }));

      if (positions.length === 0) continue;

      const id = `${route.id}:${segment.id ?? segmentIndex}`;
      const description = segment.points.some(
        (point) =>
          point.aglAltitudeM !== undefined &&
          point.altitudeM === undefined
      )
        ? "UgCS-Route; AGL-Höhen werden ohne Terrainreferenz bewusst nur als 2D-Geometrie dargestellt."
        : "UgCS-Route aus UCS Segment/Figure-Geometrie.";

      if (segment.figureType === "FT_POLYGON" && positions.length >= 3) {
        features.push({
          type: "polygon",
          id,
          positions,
          label: route.name,
          description
        });
        continue;
      }

      const first = positions[0];
      if (!first) continue;

      if (positions.length === 1) {
        features.push({
          type: "point",
          id,
          position: first,
          label: route.name,
          description
        });
        continue;
      }

      features.push({
        type: "line",
        id,
        positions,
        label: route.name,
        description
      });
    }
  }

  return features;
}

function toUgcsTelemetryFeatures(
  snapshot: UgcsTelemetrySnapshot
): Fh2OverlayFeature[] {
  const features: Fh2OverlayFeature[] = [];

  for (const [vehicleId, values] of Object.entries(snapshot)) {
    const latitude = findUgcsSemantic(values, "S_LATITUDE");
    const longitude = findUgcsSemantic(values, "S_LONGITUDE");
    if (latitude === undefined || longitude === undefined) continue;

    const latitudeDeg = radiansToDegrees(latitude);
    const longitudeDeg = radiansToDegrees(longitude);
    if (
      latitudeDeg < -90 ||
      latitudeDeg > 90 ||
      longitudeDeg < -180 ||
      longitudeDeg > 180
    ) {
      continue;
    }

    const altitudeM =
      findUgcsSemantic(values, "S_ALTITUDE_AMSL") ??
      findUgcsSemantic(values, "S_ALTITUDE_RAW");

    features.push({
      type: "point",
      id: `vehicle:${vehicleId}`,
      position: {
        latitudeDeg,
        longitudeDeg,
        ...(altitudeM !== undefined ? { heightM: altitudeM } : {})
      },
      label: `UgCS · ${vehicleId}`,
      description: "Live-Position aus UCS-Telemetrie."
    });
  }

  return features;
}

function findUgcsSemantic(
  values: Record<string, UgcsTelemetryValue>,
  semantic: string
): number | undefined {
  for (const value of Object.values(values)) {
    if (value.semantic !== semantic) continue;
    const numeric = numberValue(value.value);
    if (numeric !== undefined) return numeric;
  }
  return undefined;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

  useEffect(() => {
    bridgeRef.current?.destroy();
    bridgeRef.current = viewer
      ? new Fh2CesiumOverlayBridge(viewer)
      : undefined;

    return () => {
      bridgeRef.current?.destroy();
      bridgeRef.current = undefined;
    };
  }, [viewer]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;

    for (const kind of OVERLAY_KINDS) {
      bridge.sync(kind, snapshot[kind], enabled[kind]);
    }
  }, [enabled, snapshot, viewer]);

  return (
    <div className="fh2-overlay-panel" aria-label="Cesium Layer">
      <span className="fh2-overlay-panel__title">Layer</span>
      {OVERLAY_KINDS.map((kind) => (
        <label key={kind} className="fh2-overlay-toggle">
          <input
            type="checkbox"
            checked={enabled[kind]}
            onChange={(event) =>
              setEnabled((current) => ({
                ...current,
                [kind]: event.target.checked
              }))
            }
          />
          <span>{OVERLAY_LABELS[kind]}</span>
          <strong>{snapshot[kind].length}</strong>
        </label>
      ))}
      <span className="fh2-overlay-viewer-state">
        {viewer ? "global viewer aktiv" : "warte auf Cesium"}
      </span>
    </div>
  );
}

function useAircraftPositions(
  topology: readonly Fh2OverlayTopology[]
): Record<string, AircraftPosition> {
  const deviceIds = useMemo(
    () =>
      [...new Set(topology.flatMap((gateway) =>
        gateway.subDevices.map((device) => device.sn)
      ))].sort(),
    [topology]
  );
  const deviceKey = deviceIds.join("\u0000");
  const [positions, setPositions] = useState<Record<string, AircraftPosition>>(
    {}
  );

  useEffect(() => {
    if (deviceIds.length === 0) {
      setPositions({});
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const entries = await Promise.all(
        deviceIds.map(async (deviceId) => {
          try {
            const response = await fetch(
              `/api/devices/${encodeURIComponent(deviceId)}/telemetry`,
              { headers: { accept: "application/json" } }
            );
            if (!response.ok) return undefined;

            const telemetry = (await response.json()) as TelemetrySnapshot;
            const position = positionFromTelemetry(telemetry);
            return position
              ? ([deviceId, position] as const)
              : undefined;
          } catch {
            return undefined;
          }
        })
      );

      if (cancelled) return;

      setPositions(
        Object.fromEntries(
          entries.filter(
            (
              entry
            ): entry is readonly [string, AircraftPosition] =>
              entry !== undefined
          )
        )
      );
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceKey]);

  return positions;
}

function positionFromTelemetry(
  telemetry: TelemetrySnapshot
): AircraftPosition | undefined {
  const latitudeDeg = numberValue(
    telemetry["flight.position.latitude_deg"]?.value
  );
  const longitudeDeg = numberValue(
    telemetry["flight.position.longitude_deg"]?.value
  );

  if (latitudeDeg === undefined || longitudeDeg === undefined) {
    return undefined;
  }

  const ellipsoidHeightM = numberValue(
    telemetry["flight.altitude.ellipsoid_m"]?.value
  );
  const relativeHeightM = numberValue(
    telemetry["flight.altitude.relative_m"]?.value
  );
  const heightM = ellipsoidHeightM ?? relativeHeightM;

  return {
    longitudeDeg,
    latitudeDeg,
    ...(heightM !== undefined ? { heightM } : {})
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isCesiumViewer(value: unknown): value is Fh2CesiumViewer {
  if (typeof value !== "object" || value === null) return false;
  const entities = (value as { entities?: unknown }).entities;
  if (typeof entities !== "object" || entities === null) return false;

  const collection = entities as {
    add?: unknown;
    removeById?: unknown;
  };
  return (
    typeof collection.add === "function" &&
    typeof collection.removeById === "function"
  );
}
