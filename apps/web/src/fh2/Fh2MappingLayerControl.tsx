import { useEffect, useRef, useState } from "react";

import { useFh2CesiumViewer } from "./useFh2CesiumViewer.js";

interface MappingLayerView {
  id: string;
  name: string;
  type: "xyz";
  format: "png";
  minZoom: number;
  maxZoom: number;
  boundsWgs84: [number, number, number, number] | null;
  opacity: number;
  tileUrl: string;
}

interface CesiumImageryLayer {
  alpha?: number;
}

interface CesiumImageryLayerCollection {
  addImageryProvider(provider: unknown): CesiumImageryLayer;
  remove(layer: CesiumImageryLayer, destroy?: boolean): boolean;
}

interface CesiumImageryViewer {
  imageryLayers: CesiumImageryLayerCollection;
}

interface CesiumRasterRuntime {
  UrlTemplateImageryProvider?: new (options: Record<string, unknown>) => unknown;
  Rectangle?: {
    fromDegrees(
      west: number,
      south: number,
      east: number,
      north: number
    ): unknown;
  };
}

export function Fh2MappingLayerControl() {
  const rawViewer = useFh2CesiumViewer("global");
  const viewer = isImageryViewer(rawViewer) ? rawViewer : undefined;
  const [layers, setLayers] = useState<MappingLayerView[]>([]);
  const [enabled, setEnabled] = useState(true);
  const activeLayers = useRef<CesiumImageryLayer[]>([]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let lastPayload = "";

    const refresh = async () => {
      if (controller) return;
      const request = new AbortController();
      controller = request;

      try {
        const response = await fetch("/api/mapping/layers", {
          headers: { accept: "application/json" },
          signal: request.signal
        });

        if (response.status === 503) {
          if (!cancelled && lastPayload !== "[]") {
            lastPayload = "[]";
            setLayers([]);
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`mapping layers HTTP ${response.status}`);
        }

        const value = await response.json();
        const next = Array.isArray(value)
          ? value.filter(isMappingLayerView)
          : [];
        const serialized = JSON.stringify(next);
        if (!cancelled && serialized !== lastPayload) {
          lastPayload = serialized;
          setLayers(next);
        }
      } catch {
        if (cancelled || request.signal.aborted) return;
        // Keep the last known-good layer set during transient failures.
      } finally {
        if (controller === request) controller = undefined;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    clearImagery(viewer, activeLayers.current);
    activeLayers.current = [];

    if (!viewer || !enabled || layers.length === 0) return;

    const Cesium = window.Cesium as unknown as CesiumRasterRuntime | undefined;
    const Provider = Cesium?.UrlTemplateImageryProvider;
    if (!Provider) return;

    for (const layer of layers) {
      const options: Record<string, unknown> = {
        url: layer.tileUrl,
        minimumLevel: layer.minZoom,
        maximumLevel: layer.maxZoom
      };

      if (layer.boundsWgs84 && Cesium?.Rectangle?.fromDegrees) {
        const [west, south, east, north] = layer.boundsWgs84;
        options.rectangle = Cesium.Rectangle.fromDegrees(
          west,
          south,
          east,
          north
        );
      }

      try {
        const provider = new Provider(options);
        const imagery = viewer.imageryLayers.addImageryProvider(provider);
        imagery.alpha = layer.opacity;
        activeLayers.current.push(imagery);
      } catch {
        // An invalid individual layer must not break the FH2 project map.
      }
    }

    return () => {
      clearImagery(viewer, activeLayers.current);
      activeLayers.current = [];
    };
  }, [enabled, layers, viewer]);

  return (
    <label className="fh2-overlay-toggle" title="Photogrammetrie-Ergebnislayer">
      <input
        type="checkbox"
        checked={enabled}
        disabled={!viewer || layers.length === 0}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      <span>Mapping</span>
      <strong>{layers.length}</strong>
    </label>
  );
}

function clearImagery(
  viewer: CesiumImageryViewer | undefined,
  layers: readonly CesiumImageryLayer[]
): void {
  if (!viewer) return;
  for (const layer of layers) {
    try {
      viewer.imageryLayers.remove(layer, true);
    } catch {
      // Viewer teardown may race with FH2 destroyProject().
    }
  }
}

function isImageryViewer(value: unknown): value is CesiumImageryViewer {
  if (typeof value !== "object" || value === null) return false;
  const imageryLayers = (value as { imageryLayers?: unknown }).imageryLayers;
  if (typeof imageryLayers !== "object" || imageryLayers === null) return false;

  const collection = imageryLayers as {
    addImageryProvider?: unknown;
    remove?: unknown;
  };
  return (
    typeof collection.addImageryProvider === "function" &&
    typeof collection.remove === "function"
  );
}

function isMappingLayerView(value: unknown): value is MappingLayerView {
  if (typeof value !== "object" || value === null) return false;
  const layer = value as Record<string, unknown>;
  return (
    typeof layer.id === "string" &&
    typeof layer.name === "string" &&
    layer.type === "xyz" &&
    layer.format === "png" &&
    Number.isInteger(layer.minZoom) &&
    Number.isInteger(layer.maxZoom) &&
    typeof layer.opacity === "number" &&
    Number.isFinite(layer.opacity) &&
    typeof layer.tileUrl === "string" &&
    (
      layer.boundsWgs84 === null ||
      (
        Array.isArray(layer.boundsWgs84) &&
        layer.boundsWgs84.length === 4 &&
        layer.boundsWgs84.every(
          (entry) => typeof entry === "number" && Number.isFinite(entry)
        )
      )
    )
  );
}
