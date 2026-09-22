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

const OVERLAY_KINDS: readonly Fh2OverlayKind[] = [
  "rtk",
  "thermal",
  "multispectral",
  "ugcs"
];

const OVERLAY_LABELS: Record<Fh2OverlayKind, string> = {
  rtk: "RTK",
  thermal: "M4T Thermal",
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
