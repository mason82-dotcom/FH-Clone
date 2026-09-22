import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  DjiGatewayTopology,
  DjiProductRef,
  DjiSubDevice,
  TopologyChange
} from "@fh-clone/adapter-dji-cloud";

interface GatewayRow extends QueryResultRow {
  gateway_sn: string;
  product_domain: string | null;
  product_type: number;
  product_sub_type: number;
  thing_version: string | null;
  observed_at: Date;
}

interface DeviceRow extends QueryResultRow {
  device_sn: string;
  gateway_sn: string;
  device_index: string | null;
  product_domain: string | null;
  product_type: number;
  product_sub_type: number;
  thing_version: string | null;
  observed_at: Date;
}

export class PostgresGatewayRegistryStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5
    });
  }

  async assertReady(): Promise<void> {
    await this.pool.query("SELECT 1 FROM dji_gateways LIMIT 1");
    await this.pool.query("SELECT 1 FROM dji_gateway_devices LIMIT 1");
  }

  async save(change: TopologyChange): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.upsertGateway(client, change.current);

      const observedAt = new Date(change.current.updatedAt);
      await client.query(
        `
          UPDATE dji_gateway_devices
          SET active = FALSE,
              removed_at = $2,
              persisted_at = NOW()
          WHERE gateway_sn = $1
            AND active = TRUE
        `,
        [change.current.gatewaySn, observedAt]
      );

      for (const device of change.current.subDevices) {
        await this.upsertDevice(
          client,
          change.current.gatewaySn,
          device,
          observedAt
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(): Promise<DjiGatewayTopology[]> {
    const [gatewayResult, deviceResult] = await Promise.all([
      this.pool.query<GatewayRow>(
        `
          SELECT
            gateway_sn,
            product_domain,
            product_type,
            product_sub_type,
            thing_version,
            observed_at
          FROM dji_gateways
          ORDER BY gateway_sn
        `
      ),
      this.pool.query<DeviceRow>(
        `
          SELECT
            device_sn,
            gateway_sn,
            device_index,
            product_domain,
            product_type,
            product_sub_type,
            thing_version,
            observed_at
          FROM dji_gateway_devices
          WHERE active = TRUE
          ORDER BY gateway_sn, device_sn
        `
      )
    ]);

    const gateways = new Map<string, DjiGatewayTopology>();

    for (const row of gatewayResult.rows) {
      gateways.set(row.gateway_sn, {
        gatewaySn: row.gateway_sn,
        product: productFromRow(row),
        subDevices: [],
        updatedAt: row.observed_at.getTime()
      });
    }

    for (const row of deviceResult.rows) {
      const gateway = gateways.get(row.gateway_sn);
      if (!gateway) continue;

      gateway.subDevices.push({
        sn: row.device_sn,
        ...(row.device_index ? { index: row.device_index } : {}),
        product: productFromRow(row)
      });
      gateway.updatedAt = Math.max(
        gateway.updatedAt,
        row.observed_at.getTime()
      );
    }

    return [...gateways.values()];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async upsertGateway(
    client: PoolClient,
    topology: DjiGatewayTopology
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO dji_gateways (
          gateway_sn,
          product_domain,
          product_type,
          product_sub_type,
          thing_version,
          observed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (gateway_sn) DO UPDATE SET
          product_domain = EXCLUDED.product_domain,
          product_type = EXCLUDED.product_type,
          product_sub_type = EXCLUDED.product_sub_type,
          thing_version = EXCLUDED.thing_version,
          observed_at = EXCLUDED.observed_at,
          persisted_at = NOW()
      `,
      [
        topology.gatewaySn,
        domainToText(topology.product.domain),
        topology.product.type,
        topology.product.subType,
        topology.product.thingVersion ?? null,
        new Date(topology.updatedAt)
      ]
    );
  }

  private async upsertDevice(
    client: PoolClient,
    gatewaySn: string,
    device: DjiSubDevice,
    observedAt: Date
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO dji_gateway_devices (
          device_sn,
          gateway_sn,
          device_index,
          product_domain,
          product_type,
          product_sub_type,
          thing_version,
          active,
          observed_at,
          removed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, NULL)
        ON CONFLICT (device_sn) DO UPDATE SET
          gateway_sn = EXCLUDED.gateway_sn,
          device_index = EXCLUDED.device_index,
          product_domain = EXCLUDED.product_domain,
          product_type = EXCLUDED.product_type,
          product_sub_type = EXCLUDED.product_sub_type,
          thing_version = EXCLUDED.thing_version,
          active = TRUE,
          observed_at = EXCLUDED.observed_at,
          removed_at = NULL,
          persisted_at = NOW()
      `,
      [
        device.sn,
        gatewaySn,
        device.index ?? null,
        domainToText(device.product.domain),
        device.product.type,
        device.product.subType,
        device.product.thingVersion ?? null,
        observedAt
      ]
    );
  }
}

function productFromRow(row: {
  product_domain: string | null;
  product_type: number;
  product_sub_type: number;
  thing_version: string | null;
}): DjiProductRef {
  return {
    ...(row.product_domain !== null
      ? { domain: row.product_domain }
      : {}),
    type: row.product_type,
    subType: row.product_sub_type,
    ...(row.thing_version !== null
      ? { thingVersion: row.thing_version }
      : {})
  };
}

function domainToText(domain: string | number | undefined): string | null {
  return domain === undefined ? null : String(domain);
}
