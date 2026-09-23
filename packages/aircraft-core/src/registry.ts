import type {
  AdapterDevice,
  AdapterId,
  DeviceId,
  ParameterSample
} from "./types.js";

export class DeviceRegistry {
  private readonly devices = new Map<
    DeviceId,
    Map<string, AdapterDevice>
  >();

  upsert(device: AdapterDevice): void {
    const byAdapter =
      this.devices.get(device.identity.id) ??
      new Map<string, AdapterDevice>();
    byAdapter.set(device.adapterId, device);
    this.devices.set(device.identity.id, byAdapter);
  }

  list(): AdapterDevice[] {
    return [...this.devices.values()].flatMap(
      (entries) => [...entries.values()]
    );
  }

  get(deviceId: DeviceId): AdapterDevice[] {
    return [
      ...(this.devices.get(deviceId)?.values() ?? [])
    ];
  }
}

export class ParameterRegistry {
  private readonly latest = new Map<
    DeviceId,
    Map<string, ParameterSample>
  >();

  private readonly latestByAdapter = new Map<
    DeviceId,
    Map<string, Map<AdapterId, ParameterSample>>
  >();

  update(sample: ParameterSample): void {
    const byKey =
      this.latestByAdapter.get(sample.deviceId) ??
      new Map<string, Map<AdapterId, ParameterSample>>();
    const byAdapter =
      byKey.get(sample.key) ??
      new Map<AdapterId, ParameterSample>();

    const currentForAdapter = byAdapter.get(sample.adapterId);
    if (
      currentForAdapter &&
      sample.sampledAt < currentForAdapter.sampledAt
    ) {
      return;
    }

    byAdapter.set(sample.adapterId, sample);
    byKey.set(sample.key, byAdapter);
    this.latestByAdapter.set(sample.deviceId, byKey);

    const fused = selectCurrentSample(byAdapter.values());
    if (!fused) return;

    const values =
      this.latest.get(sample.deviceId) ??
      new Map<string, ParameterSample>();
    values.set(sample.key, fused);
    this.latest.set(sample.deviceId, values);
  }

  /**
   * Backward-compatible fused view.
   *
   * For a canonical key reported by multiple adapters, the newest sample
   * wins. Equal timestamps are resolved deterministically by quality and
   * adapter id. Adapter-specific source samples remain available through
   * snapshotSources().
   */
  snapshot(
    deviceId: DeviceId
  ): Record<string, ParameterSample> {
    return Object.fromEntries(
      this.latest.get(deviceId)?.entries() ?? []
    );
  }

  /**
   * Provenance-preserving view of every latest adapter sample per key.
   * This is read-only telemetry evidence and grants no authority.
   */
  snapshotSources(
    deviceId: DeviceId
  ): Record<string, Record<AdapterId, ParameterSample>> {
    const byKey = this.latestByAdapter.get(deviceId);
    if (!byKey) return {};

    return Object.fromEntries(
      [...byKey.entries()].map(([key, byAdapter]) => [
        key,
        Object.fromEntries(byAdapter.entries())
      ])
    );
  }

  listDeviceIds(): DeviceId[] {
    return [...this.latest.keys()];
  }
}

function selectCurrentSample(
  samples: Iterable<ParameterSample>
): ParameterSample | undefined {
  let selected: ParameterSample | undefined;

  for (const candidate of samples) {
    if (!selected || compareSamples(candidate, selected) > 0) {
      selected = candidate;
    }
  }

  return selected;
}

function compareSamples(
  left: ParameterSample,
  right: ParameterSample
): number {
  if (left.sampledAt !== right.sampledAt) {
    return left.sampledAt - right.sampledAt;
  }

  const quality =
    qualityRank(left.quality) - qualityRank(right.quality);
  if (quality !== 0) return quality;

  return left.adapterId.localeCompare(right.adapterId);
}

function qualityRank(
  quality: ParameterSample["quality"]
): number {
  switch (quality) {
    case "good":
      return 4;
    case "unknown":
    case undefined:
      return 3;
    case "stale":
      return 2;
    case "invalid":
      return 1;
  }
}
