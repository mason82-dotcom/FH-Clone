import type {
  AdapterDevice,
  AircraftAdapter,
  AircraftCommand,
  Capability,
  CommandResult,
  DeviceId
} from "./types.js";

export interface ControlLease {
  deviceId: DeviceId;
  adapterId: string;
  owner: string;
  expiresAt: number;
}

export class ControlAuthority {
  private readonly leases = new Map<DeviceId, ControlLease>();

  acquire(lease: ControlLease, now = Date.now()): boolean {
    const current = this.leases.get(lease.deviceId);
    if (current && current.expiresAt > now && current.owner !== lease.owner) return false;
    if (lease.expiresAt <= now) return false;
    this.leases.set(lease.deviceId, lease);
    return true;
  }

  release(deviceId: DeviceId, owner: string): boolean {
    const current = this.leases.get(deviceId);
    if (!current || current.owner !== owner) return false;
    this.leases.delete(deviceId);
    return true;
  }

  get(deviceId: DeviceId, now = Date.now()): ControlLease | undefined {
    const current = this.leases.get(deviceId);
    if (!current) return undefined;
    if (current.expiresAt <= now) {
      this.leases.delete(deviceId);
      return undefined;
    }
    return current;
  }
}

export class CapabilityRouter {
  constructor(
    private readonly adapters: Map<string, AircraftAdapter>,
    private readonly getDevices: (deviceId: DeviceId) => AdapterDevice[]
  ) {}

  resolve(
    deviceId: DeviceId,
    capability: Capability,
    preferredAdapterId?: string
  ): AircraftAdapter | undefined {
    const candidates = this.getDevices(deviceId)
      .filter((device) =>
        device.connected &&
        device.capabilities.includes(capability) &&
        (!preferredAdapterId || device.adapterId === preferredAdapterId)
      )
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    for (const candidate of candidates) {
      const adapter = this.adapters.get(candidate.adapterId);
      if (adapter) return adapter;
    }
    return undefined;
  }

  async execute(
    command: AircraftCommand,
    preferredAdapterId?: string
  ): Promise<CommandResult> {
    const adapter = this.resolve(
      command.deviceId,
      command.capability,
      preferredAdapterId
    );
    if (!adapter) {
      return {
        ok: false,
        code: "unsupported",
        message: preferredAdapterId
          ? `Adapter ${preferredAdapterId} does not provide capability ${command.capability} for device ${command.deviceId}`
          : `No connected adapter provides capability ${command.capability}`
      };
    }
    return adapter.execute(command);
  }
}

export class CommandCoordinator {
  constructor(
    private readonly authority: ControlAuthority,
    private readonly router: CapabilityRouter
  ) {}

  async execute(
    owner: string,
    command: AircraftCommand,
    now = Date.now()
  ): Promise<CommandResult> {
    const lease = this.authority.get(command.deviceId, now);
    if (!lease) {
      return {
        ok: false,
        code: "rejected",
        message: `No active control lease for device ${command.deviceId}`
      };
    }

    if (lease.owner !== owner) {
      return {
        ok: false,
        code: "rejected",
        message: "Control lease is owned by another client"
      };
    }

    return this.router.execute(command, lease.adapterId);
  }
}
