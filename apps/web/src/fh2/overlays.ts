export type Fh2OverlayKind =
  | "rtk"
  | "thermal"
  | "multispectral"
  | "ugcs";

export interface Fh2OverlayPosition {
  longitudeDeg: number;
  latitudeDeg: number;
  heightM?: number;
}

export interface Fh2OverlayPointFeature {
  type: "point";
  id: string;
  position: Fh2OverlayPosition;
  label: string;
  description?: string;
}

export interface Fh2OverlayLineFeature {
  type: "line";
  id: string;
  positions: Fh2OverlayPosition[];
  label?: string;
  description?: string;
}

export interface Fh2OverlayPolygonFeature {
  type: "polygon";
  id: string;
  positions: Fh2OverlayPosition[];
  label?: string;
  description?: string;
}

export type Fh2OverlayFeature =
  | Fh2OverlayPointFeature
  | Fh2OverlayLineFeature
  | Fh2OverlayPolygonFeature;

export type Fh2OverlaySnapshot = Record<
  Fh2OverlayKind,
  readonly Fh2OverlayFeature[]
>;

export interface Fh2CesiumEntityCollection {
  add(entity: Record<string, unknown>): unknown;
  removeById(id: string): boolean;
}

export interface Fh2CesiumViewer {
  entities: Fh2CesiumEntityCollection;
}

type OverlayListener = (snapshot: Fh2OverlaySnapshot) => void;

const KINDS: readonly Fh2OverlayKind[] = [
  "rtk",
  "thermal",
  "multispectral",
  "ugcs"
];

const producers = new Map<
  Fh2OverlayKind,
  Map<string, readonly Fh2OverlayFeature[]>
>();
const listeners = new Set<OverlayListener>();

function emptySnapshot(): Fh2OverlaySnapshot {
  return {
    rtk: [],
    thermal: [],
    multispectral: [],
    ugcs: []
  };
}

export function getFh2OverlaySnapshot(): Fh2OverlaySnapshot {
  const snapshot = emptySnapshot();

  for (const kind of KINDS) {
    const features = [...(producers.get(kind)?.values() ?? [])].flat();
    snapshot[kind] = features;
  }

  return snapshot;
}

export function setFh2OverlayFeatures(
  kind: Fh2OverlayKind,
  producerId: string,
  features: readonly Fh2OverlayFeature[]
): void {
  const byProducer =
    producers.get(kind) ?? new Map<string, readonly Fh2OverlayFeature[]>();

  byProducer.set(producerId, [...features]);
  producers.set(kind, byProducer);
  notify();
}

export function clearFh2OverlayProducer(
  kind: Fh2OverlayKind,
  producerId: string
): void {
  const byProducer = producers.get(kind);
  if (!byProducer) return;

  byProducer.delete(producerId);
  if (byProducer.size === 0) producers.delete(kind);
  notify();
}

export function subscribeFh2Overlays(listener: OverlayListener): () => void {
  listeners.add(listener);
  listener(getFh2OverlaySnapshot());
  return () => listeners.delete(listener);
}

function notify(): void {
  const snapshot = getFh2OverlaySnapshot();
  for (const listener of listeners) listener(snapshot);
}

const LAYER_COLORS: Record<Fh2OverlayKind, string> = {
  rtk: "#55c895",
  thermal: "#e47a52",
  multispectral: "#b58cff",
  ugcs: "#61a8e8"
};

export class Fh2CesiumOverlayBridge {
  private readonly ids = new Map<Fh2OverlayKind, Set<string>>();

  constructor(private readonly viewer: Fh2CesiumViewer) {}

  sync(
    kind: Fh2OverlayKind,
    features: readonly Fh2OverlayFeature[],
    enabled: boolean
  ): void {
    this.clear(kind);
    if (!enabled) return;

    for (const feature of features) {
      const id = entityId(kind, feature.id);
      const entity = toCesiumEntity(kind, id, feature);
      if (!entity) continue;

      this.viewer.entities.add(entity);
      const layerIds = this.ids.get(kind) ?? new Set<string>();
      layerIds.add(id);
      this.ids.set(kind, layerIds);
    }
  }

  clear(kind: Fh2OverlayKind): void {
    for (const id of this.ids.get(kind) ?? []) {
      this.viewer.entities.removeById(id);
    }
    this.ids.delete(kind);
  }

  destroy(): void {
    for (const kind of KINDS) this.clear(kind);
  }
}

function entityId(kind: Fh2OverlayKind, featureId: string): string {
  return `fh2:${kind}:${featureId}`;
}

function toCesiumEntity(
  kind: Fh2OverlayKind,
  id: string,
  feature: Fh2OverlayFeature
): Record<string, unknown> | undefined {
  const Cesium = window.Cesium;
  const fromDegrees = Cesium?.Cartesian3?.fromDegrees;
  if (!fromDegrees) return undefined;

  const color =
    Cesium.Color?.fromCssColorString?.(LAYER_COLORS[kind]);
  const translucent =
    color && typeof color.withAlpha === "function"
      ? color.withAlpha(0.22)
      : color;

  if (feature.type === "point") {
    const position = toCartesian(feature.position, fromDegrees);

    return {
      id,
      name: feature.label,
      position,
      ...(feature.description ? { description: feature.description } : {}),
      point: {
        pixelSize: 11,
        ...(color ? { color } : {}),
        outlineWidth: 2,
        ...(Cesium.Color?.BLACK ? { outlineColor: Cesium.Color.BLACK } : {}),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: feature.label,
        font: "12px sans-serif",
        ...(color ? { fillColor: color } : {}),
        showBackground: true,
        ...(Cesium.Color?.BLACK
          ? {
              backgroundColor:
                typeof Cesium.Color.BLACK.withAlpha === "function"
                  ? Cesium.Color.BLACK.withAlpha(0.72)
                  : Cesium.Color.BLACK
            }
          : {}),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    };
  }

  const positions = feature.positions.map((position) =>
    toCartesian(position, fromDegrees)
  );

  if (feature.type === "line") {
    if (positions.length < 2) return undefined;

    return {
      id,
      ...(feature.label ? { name: feature.label } : {}),
      ...(feature.description ? { description: feature.description } : {}),
      polyline: {
        positions,
        width: 3,
        ...(color ? { material: color } : {}),
        clampToGround: false
      }
    };
  }

  if (positions.length < 3) return undefined;

  const hierarchy = Cesium.PolygonHierarchy
    ? new Cesium.PolygonHierarchy(positions)
    : positions;

  return {
    id,
    ...(feature.label ? { name: feature.label } : {}),
    ...(feature.description ? { description: feature.description } : {}),
    polygon: {
      hierarchy,
      ...(translucent ? { material: translucent } : {}),
      outline: true,
      ...(color ? { outlineColor: color } : {})
    }
  };
}

function toCartesian(
  position: Fh2OverlayPosition,
  fromDegrees: (
    longitude: number,
    latitude: number,
    height?: number
  ) => unknown
): unknown {
  return fromDegrees(
    position.longitudeDeg,
    position.latitudeDeg,
    position.heightM ?? 0
  );
}
