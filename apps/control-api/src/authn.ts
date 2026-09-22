import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";

import { Pool, type QueryResultRow } from "pg";

const SCRYPT_PREFIX = "scrypt$v1";
const SCRYPT_KEY_LENGTH = 32;
const SAFE_GATEWAY_SN = /^[A-Za-z0-9_-]+$/;

export interface EmqxAuthenticationRequest {
  username: string;
  password: string;
  clientid: string;
  peerhost?: string;
}

export type EmqxAuthenticationDecision =
  | {
      result: "allow";
      is_superuser: false;
      client_attrs: Record<string, string>;
    }
  | {
      result: "deny";
      is_superuser: false;
    };

export interface GatewayCredential {
  principalId: string;
  username: string;
  passwordHash: string;
  gatewaySn: string;
  enabled: boolean;
}

export interface GatewayCredentialStore {
  findByUsername(username: string): Promise<GatewayCredential | undefined>;
  isActiveBinding(username: string, gatewaySn: string): Promise<boolean>;
}

interface GatewayCredentialRow extends QueryResultRow {
  principal_id: string;
  username: string;
  password_hash: string;
  gateway_sn: string;
  enabled: boolean;
}

export class PostgresGatewayCredentialStore
  implements GatewayCredentialStore
{
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 30_000
    });
  }

  async assertReady(): Promise<void> {
    await this.pool.query("SELECT 1 FROM gateway_credentials LIMIT 1");
  }

  async findByUsername(
    username: string
  ): Promise<GatewayCredential | undefined> {
    const result = await this.pool.query<GatewayCredentialRow>(
      `
        SELECT
          principal_id,
          username,
          password_hash,
          gateway_sn,
          enabled
        FROM gateway_credentials
        WHERE username = $1
        LIMIT 1
      `,
      [username]
    );

    const row = result.rows[0];
    return row
      ? {
          principalId: row.principal_id,
          username: row.username,
          passwordHash: row.password_hash,
          gatewaySn: row.gateway_sn,
          enabled: row.enabled
        }
      : undefined;
  }

  async isActiveBinding(
    username: string,
    gatewaySn: string
  ): Promise<boolean> {
    const result = await this.pool.query<{ active: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM gateway_credentials
          WHERE username = $1
            AND gateway_sn = $2
            AND enabled = TRUE
        ) AS active
      `,
      [username, gatewaySn]
    );

    return result.rows[0]?.active === true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function authenticateEmqx(
  store: GatewayCredentialStore | undefined,
  request: EmqxAuthenticationRequest,
  backendPassword: string | undefined
): Promise<EmqxAuthenticationDecision> {
  if (request.username === "backend-service") {
    if (
      !backendPassword ||
      !constantTimeTextEqual(request.password, backendPassword)
    ) {
      return deny();
    }

    return {
      result: "allow",
      is_superuser: false,
      client_attrs: {
        role: "backend_service"
      }
    };
  }

  if (!request.username.startsWith("dji-gateway-") || !store) {
    return deny();
  }

  const credential = await store.findByUsername(request.username);
  if (
    !credential ||
    !credential.enabled ||
    !SAFE_GATEWAY_SN.test(credential.gatewaySn)
  ) {
    return deny();
  }

  const passwordOk = await verifyGatewayPassword(
    request.password,
    credential.passwordHash
  );
  if (!passwordOk) return deny();

  return {
    result: "allow",
    is_superuser: false,
    client_attrs: {
      role: "dji_gateway",
      gateway_sn: credential.gatewaySn
    }
  };
}

export function isEmqxAuthenticationRequest(
  value: unknown
): value is EmqxAuthenticationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;
  if (typeof request.username !== "string" || request.username.length === 0) {
    return false;
  }
  if (typeof request.password !== "string" || request.password.length === 0) {
    return false;
  }
  if (typeof request.clientid !== "string") {
    return false;
  }
  if (
    request.peerhost !== undefined &&
    typeof request.peerhost !== "string"
  ) {
    return false;
  }

  return true;
}

export async function hashGatewayPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return [
    SCRYPT_PREFIX,
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
}

export async function verifyGatewayPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (
    parts.length !== 4 ||
    `${parts[0]}$${parts[1]}` !== SCRYPT_PREFIX
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[2] ?? "", "base64");
    expected = Buffer.from(parts[3] ?? "", "base64");
  } catch {
    return false;
  }

  if (salt.length < 16 || expected.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }

  const actual = await scrypt(password, salt);
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: 16_384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function deny(): EmqxAuthenticationDecision {
  return {
    result: "deny",
    is_superuser: false
  };
}
