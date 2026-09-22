import type { AdapterDevice, DeviceId, ParameterSample } from "./types.js";

export class DeviceRegistry {
  private readonly devices = new Map<DeviceId, Map<string, AdapterDevice>>();

  upsert(device: AdapterDevice): void {
    const byAdapter = this.devices.get(device.identity.id) ?? new Map<string, AdapterDevice>();
    byAdapter.set(device.adapterId, device);
    this.devices.set(device.identity.id, byAdapter);
  }

  list(): AdapterDevice[] {
    return [...this.devices.values()].flatMap((entries) => [...entries.values()]);
  }

  get(deviceId: DeviceId): AdapterDevice[] {
    return [...(this.devices.get(deviceId)?.values() ?? [])];
  }
}

export class ParameterRegistry {
  private readonly latest = new Map<DeviceId, Map<string, ParameterSample>>();

  update(sample: ParameterSample): void {
    const values = this.latest.get(sample.deviceId) ?? new Map<string, ParameterSample>();
    const current = values.get(sample.key);
    if (!current || sample.sampledAt >= current.sampledAt) values.set(sample.key, sample);
    this.latest.set(sample.deviceId, values);
  }

  snapshot(deviceId: DeviceId): Record<string, ParameterSample> {
    return Object.fromEntries(this.latest.get(deviceId)?.entries() ?? []);
  }

  listDeviceIds(): DeviceId[] {
    return [...this.latest.keys()];
  }
}
