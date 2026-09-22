export {};

type Fh2EventHandler = (payload?: unknown) => void;

interface Fh2InitConfig {
  serverUrl: string;
  wssUrl: string;
  hostUrl: string;
  prjId: string;
  projectToken: string;
}

interface Fh2CockpitOptionsCurrent {
  gatewaySn: string;
  droneSn: string;
  map?: boolean;
}

interface Fh2CockpitOptionsLegacy {
  gateway_sn: string;
  drone_sn: string;
  map?: boolean;
}

interface Fh2ViewerLike {
  entities?: {
    add(entity: unknown): unknown;
  };
  [key: string]: unknown;
}

interface Fh2Runtime {
  initConfig(config: Fh2InitConfig): void;
  validateToken?(token: string): boolean | Promise<boolean>;

  loadProject(containerId: string): void;
  destroyProject(): void;

  loadCockpit(
    containerId: string,
    options: Fh2CockpitOptionsCurrent | Fh2CockpitOptionsLegacy
  ): void;
  destroyCockpit(isEffect?: boolean): void;

  loadWaylineCreation(
    containerId: string,
    options?: { folder_id?: string }
  ): void;
  destroyWaylineCreation(): void;

  loadWayline(
    containerId: string,
    options: { wayline_id: string }
  ): void;
  destroyWayline(isEffect?: boolean): void;

  loadFlightPath(
    containerId: string,
    options: { flight_path_id: string }
  ): void;
  destroyFlightPath(): void;

  subscribe(eventName: string, handler: Fh2EventHandler): void;
  cesiumViewer: Record<string, Fh2ViewerLike | undefined>;
}

declare global {
  interface Window {
    FH2: Fh2Runtime;
    Cesium?: {
      Cartesian3?: {
        fromDegrees(
          longitude: number,
          latitude: number,
          height?: number
        ): unknown;
      };
      [key: string]: unknown;
    };
  }
}
