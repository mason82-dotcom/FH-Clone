import type {
  GroundStationCapability,
  GroundStationHealth,
  GroundStationRoute,
  GroundStationTelemetrySnapshot,
  GroundStationVehicle
} from "@fh-clone/aircraft-core";
import type { UgcsBridgeTransport } from "./index.js";

const READ_CAPABILITIES = [
  "groundstation.vehicle.read",
  "groundstation.telemetry.read",
  "groundstation.route.read"
] as const satisfies readonly GroundStationCapability[];

export interface HttpUgcsBridgeOptions {
  baseUrl: string;
  requestTimeoutMs?: number;
}

export class HttpUgcsBridgeTransport implements UgcsBridgeTransport {
  readonly capabilities = READ_CAPABILITIES;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(options: HttpUgcsBridgeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  }

  async connect(): Promise<void> {
    const status = await this.health();
    if (!status.connected) {
      throw new Error("UgCS UCS bridge is not connected");
    }
  }

  async disconnect(): Promise<void> {
    // HTTP transport is stateless. The bridge process owns the UCS session.
  }

  async health(): Promise<GroundStationHealth> {
    return this.getJson<GroundStationHealth>("/health");
  }

  async listVehicles(): Promise<GroundStationVehicle[]> {
    return this.getJson<GroundStationVehicle[]>("/vehicles");
  }

  async listRoutes(): Promise<GroundStationRoute[]> {
    return this.getJson<GroundStationRoute[]>("/routes");
  }

  async readTelemetrySnapshot(): Promise<GroundStationTelemetrySnapshot> {
    return this.getJson<GroundStationTelemetrySnapshot>("/telemetry");
  }

  private async getJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`UgCS bridge ${path} failed with HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
