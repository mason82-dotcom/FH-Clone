export interface DjiProductRef {
  domain?: string | number;
  type: number;
  subType: number;
  thingVersion?: string;
}

export interface DjiSubDevice {
  sn: string;
  index?: string;
  product: DjiProductRef;
}

export interface DjiGatewayTopology {
  gatewaySn: string;
  product: DjiProductRef;
  subDevices: DjiSubDevice[];
  updatedAt: number;
}

export interface TopologyChange {
  current: DjiGatewayTopology;
  removedSubDevices: DjiSubDevice[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseDjiTopologyUpdate(
  gatewaySn: string,
  payload: unknown,
  receivedAt = Date.now()
): DjiGatewayTopology | undefined {
  if (!isRecord(payload) || payload.method !== "update_topo" || !isRecord(payload.data)) {
    return undefined;
  }

  const data = payload.data;
  if (typeof data.type !== "number" || !Array.isArray(data.sub_devices)) {
    return undefined;
  }

  const subDevices: DjiSubDevice[] = [];
  for (const item of data.sub_devices) {
    if (!isRecord(item) || typeof item.sn !== "string" || typeof item.type !== "number") {
      continue;
    }

    subDevices.push({
      sn: item.sn,
      ...(typeof item.index === "string" ? { index: item.index } : {}),
      product: {
        ...(typeof item.domain === "string" || typeof item.domain === "number"
          ? { domain: item.domain }
          : {}),
        type: item.type,
        subType: numberOrZero(item.sub_type),
        ...(typeof item.thing_version === "string"
          ? { thingVersion: item.thing_version }
          : typeof item.version === "string"
            ? { thingVersion: item.version }
            : {})
      }
    });
  }

  return {
    gatewaySn,
    product: {
      ...(typeof data.domain === "string" || typeof data.domain === "number"
        ? { domain: data.domain }
        : {}),
      type: data.type,
      subType: numberOrZero(data.sub_type),
      ...(typeof data.thing_version === "string"
        ? { thingVersion: data.thing_version }
        : typeof data.version === "string"
          ? { thingVersion: data.version }
          : {})
    },
    subDevices,
    updatedAt: receivedAt
  };
}

export class DjiTopologyRegistry {
  private readonly gateways = new Map<string, DjiGatewayTopology>();
  private readonly gatewayByDevice = new Map<string, string>();

  apply(topology: DjiGatewayTopology): TopologyChange {
    const previous = this.gateways.get(topology.gatewaySn);
    const nextIds = new Set(topology.subDevices.map((device) => device.sn));
    const removedSubDevices =
      previous?.subDevices.filter((device) => !nextIds.has(device.sn)) ?? [];

    for (const removed of removedSubDevices) {
      if (this.gatewayByDevice.get(removed.sn) === topology.gatewaySn) {
        this.gatewayByDevice.delete(removed.sn);
      }
    }

    this.gatewayByDevice.set(topology.gatewaySn, topology.gatewaySn);
    for (const device of topology.subDevices) {
      this.gatewayByDevice.set(device.sn, topology.gatewaySn);
    }

    this.gateways.set(topology.gatewaySn, topology);
    return { current: topology, removedSubDevices };
  }

  resolveGatewaySn(deviceOrGatewaySn: string): string | undefined {
    return this.gatewayByDevice.get(deviceOrGatewaySn);
  }

  isDeviceBehindGateway(gatewaySn: string, deviceSn: string): boolean {
    return this.gatewayByDevice.get(deviceSn) === gatewaySn && deviceSn !== gatewaySn;
  }

  getGateway(gatewaySn: string): DjiGatewayTopology | undefined {
    return this.gateways.get(gatewaySn);
  }

  listGateways(): DjiGatewayTopology[] {
    return [...this.gateways.values()];
  }
}

export function describeDjiProduct(product: DjiProductRef): string {
  const domain = String(product.domain ?? "");

  if (domain === "2" && product.type === 144 && product.subType === 0) {
    return "DJI RC Pro Enterprise";
  }
  if (domain === "2" && product.type === 119 && product.subType === 0) {
    return "DJI RC Plus";
  }
  if (domain === "2" && product.type === 174 && product.subType === 0) {
    return "DJI RC Plus 2";
  }

  if (domain === "0" && product.type === 77) {
    if (product.subType === 0) return "DJI Mavic 3 Enterprise";
    if (product.subType === 1) return "DJI Mavic 3 Thermal";
    if (product.subType === 3) return "DJI Mavic 3TA";
  }

  if (domain === "0" && product.type === 99) {
    if (product.subType === 0) return "DJI Matrice 4E";
    if (product.subType === 1) return "DJI Matrice 4T";
  }

  return `DJI product ${product.domain ?? "?"}/${product.type}/${product.subType}`;
}


/** Sanitized representation suitable for diagnostics/persistence hooks. */
export function toPublicDjiTopologyPayload(
  topology: DjiGatewayTopology
): Record<string, unknown> {
  return {
    method: "update_topo",
    data: {
      ...(topology.product.domain !== undefined ? { domain: topology.product.domain } : {}),
      type: topology.product.type,
      sub_type: topology.product.subType,
      ...(topology.product.thingVersion ? { thing_version: topology.product.thingVersion } : {}),
      sub_devices: topology.subDevices.map((device) => ({
        sn: device.sn,
        ...(device.index ? { index: device.index } : {}),
        ...(device.product.domain !== undefined ? { domain: device.product.domain } : {}),
        type: device.product.type,
        sub_type: device.product.subType,
        ...(device.product.thingVersion ? { thing_version: device.product.thingVersion } : {})
      }))
    }
  };
}
