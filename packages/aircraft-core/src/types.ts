export type AdapterId = string;
export type DeviceId = string;

export type Capability =
  | "telemetry.flight"
  | "telemetry.battery"
  | "telemetry.rtk"
  | "telemetry.camera"
  | "telemetry.gimbal"
  | "control.flight"
  | "control.rth"
  | "control.pointing"
  | "control.orbit"
  | "control.camera"
  | "control.gimbal"
  | "mission.wayline"
  | "media.read"
  | "livestream.read"
  | "payload.control"
  | (string & {});

export interface DeviceIdentity {
  id: DeviceId;
  vendor: string;
  serialNumber?: string;
  model?: string;
  productType?: string;
}

export interface AdapterDevice {
  identity: DeviceIdentity;
  adapterId: AdapterId;
  capabilities: Capability[];
  connected: boolean;
  lastSeenAt: number;
}

export interface RawMessage {
  adapterId: AdapterId;
  deviceId?: DeviceId;
  receivedAt: number;
  channel: string;
  payload: unknown;
}

export interface ParameterSample {
  adapterId: AdapterId;
  deviceId: DeviceId;
  key: string;
  rawKey?: string;
  value: unknown;
  unit?: string;
  sampledAt: number;
  quality?: "good" | "stale" | "invalid" | "unknown";
}

export interface AircraftCommand<T = unknown> {
  deviceId: DeviceId;
  capability: Capability;
  method: string;
  data?: T;
  correlationId: string;
  timeoutMs: number;
}

export type CommandResult =
  | { ok: true; data?: unknown }
  | {
      ok: false;
      code: "unsupported" | "disabled" | "timeout" | "rejected" | "error";
      message: string;
    };

export interface AdapterEvents {
  onRawMessage?(message: RawMessage): void | Promise<void>;
  onParameter?(sample: ParameterSample): void | Promise<void>;
  onDevice?(device: AdapterDevice): void | Promise<void>;
}

export interface AircraftAdapter {
  readonly id: AdapterId;
  start(events: AdapterEvents): Promise<void>;
  stop(): Promise<void>;
  listDevices(): Promise<AdapterDevice[]>;
  execute(command: AircraftCommand): Promise<CommandResult>;
}
