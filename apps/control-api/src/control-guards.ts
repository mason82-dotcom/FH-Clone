export interface ControlLease {
  aircraftSn: string;
  holder: string;
  expiresAt: number;
}

export class RuntimeControlGuardRegistry {
  private readonly fc3 = new Set<string>();
  private readonly leases = new Map<string, ControlLease>();

  constructor(private readonly now: () => number = Date.now) {}

  setFc3(aircraftSn: string, enabled: boolean): void {
    if (enabled) this.fc3.add(aircraftSn);
    else this.fc3.delete(aircraftSn);
  }

  hasFc3(aircraftSn: string): boolean {
    return this.fc3.has(aircraftSn);
  }

  acquireLease(aircraftSn: string, holder: string, ttlMs: number): ControlLease {
    if (!holder.trim()) throw new Error("control lease holder is required");
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError("control lease ttlMs must be greater than zero");
    const current = this.getLease(aircraftSn);
    if (current && current.holder !== holder) throw new Error(`control lease already held by ${current.holder}`);
    const lease = { aircraftSn, holder, expiresAt: this.now() + ttlMs };
    this.leases.set(aircraftSn, lease);
    return { ...lease };
  }

  getLease(aircraftSn: string): ControlLease | undefined {
    const lease = this.leases.get(aircraftSn);
    if (!lease) return undefined;
    if (lease.expiresAt <= this.now()) {
      this.leases.delete(aircraftSn);
      return undefined;
    }
    return { ...lease };
  }

  hasLease(aircraftSn: string, holder?: string): boolean {
    const lease = this.getLease(aircraftSn);
    return Boolean(lease && (holder === undefined || lease.holder === holder));
  }

  releaseLease(aircraftSn: string, holder?: string): boolean {
    const lease = this.getLease(aircraftSn);
    if (!lease || (holder !== undefined && lease.holder !== holder)) return false;
    return this.leases.delete(aircraftSn);
  }
}
