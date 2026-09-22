import type {
  GroundStationAdapter,
  GroundStationCapability,
  GroundStationHealth,
  GroundStationMission,
  GroundStationRoute,
  GroundStationTelemetrySnapshot,
  GroundStationVehicle,
  MissionBinary
} from "@fh-clone/aircraft-core";

export interface UgcsBridgeTransport {
  readonly capabilities: readonly GroundStationCapability[];

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<GroundStationHealth>;
  listVehicles(): Promise<GroundStationVehicle[]>;
  listRoutes?(): Promise<GroundStationRoute[]>;
  readTelemetrySnapshot?(): Promise<GroundStationTelemetrySnapshot>;

  importMission?(input: MissionBinary): Promise<GroundStationMission>;
  exportMission?(missionId: string, format: string): Promise<MissionBinary>;
  uploadMission?(vehicleId: string, missionId: string): Promise<void>;
}

export class UgcsAdapter implements GroundStationAdapter {
  readonly id = "ugcs";

  constructor(private readonly bridge: UgcsBridgeTransport) {}

  get capabilities(): readonly GroundStationCapability[] {
    return this.bridge.capabilities;
  }

  async start(): Promise<void> {
    await this.bridge.connect();
  }

  async stop(): Promise<void> {
    await this.bridge.disconnect();
  }

  async health(): Promise<GroundStationHealth> {
    return this.bridge.health();
  }

  async listVehicles(): Promise<GroundStationVehicle[]> {
    return this.bridge.listVehicles();
  }

  async listRoutes(): Promise<GroundStationRoute[]> {
    if (!this.bridge.listRoutes) {
      throw new Error("UgCS bridge does not provide route listing");
    }
    return this.bridge.listRoutes();
  }

  async readTelemetrySnapshot(): Promise<GroundStationTelemetrySnapshot> {
    if (!this.bridge.readTelemetrySnapshot) {
      throw new Error("UgCS bridge does not provide telemetry snapshots");
    }
    return this.bridge.readTelemetrySnapshot();
  }

  async importMission(input: MissionBinary): Promise<GroundStationMission> {
    if (!this.bridge.importMission) {
      throw new Error("UgCS bridge does not provide mission import");
    }
    return this.bridge.importMission(input);
  }

  async exportMission(missionId: string, format: string): Promise<MissionBinary> {
    if (!this.bridge.exportMission) {
      throw new Error("UgCS bridge does not provide mission export");
    }
    return this.bridge.exportMission(missionId, format);
  }

  async uploadMission(vehicleId: string, missionId: string): Promise<void> {
    if (!this.bridge.uploadMission) {
      throw new Error("UgCS bridge does not provide mission upload");
    }
    await this.bridge.uploadMission(vehicleId, missionId);
  }
}

export * from "./http-bridge.js";
