import { createHash } from "node:crypto";
import { Pool } from "pg";

export interface MsdkTokenRevocationStoreOptions {
  connectionString?: string | undefined;
  now?: (() => number) | undefined;
}

interface RevocationRow {
  token_hash: string;
  expires_at_ms: string | number;
}

export class MsdkTokenRevocationStore {
  private readonly pool: Pool | undefined;
  private readonly revokedUntil = new Map<string, number>();
  private readonly now: () => number;

  constructor(options: MsdkTokenRevocationStoreOptions = {}) {
    this.pool = options.connectionString
      ? new Pool({ connectionString: options.connectionString })
      : undefined;
    this.now = options.now ?? Date.now;
  }

  get persistent(): boolean {
    return Boolean(this.pool);
  }

  async initialize(): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(
      "DELETE FROM msdk_token_revocations WHERE expires_at <= NOW()"
    );

    const result = await this.pool.query<RevocationRow>(
      `SELECT token_hash,
              (EXTRACT(EPOCH FROM expires_at) * 1000)::bigint AS expires_at_ms
         FROM msdk_token_revocations
        WHERE expires_at > NOW()`
    );

    this.revokedUntil.clear();
    for (const row of result.rows) {
      const expiresAt = Number(row.expires_at_ms);
      if (Number.isFinite(expiresAt)) {
        this.revokedUntil.set(row.token_hash, expiresAt);
      }
    }
  }

  isRevoked(token: string): boolean {
    const hash = hashMsdkAgentToken(token);
    const expiresAt = this.revokedUntil.get(hash);
    if (expiresAt === undefined) return false;

    if (expiresAt <= this.now()) {
      this.revokedUntil.delete(hash);
      return false;
    }

    return true;
  }

  async revoke(token: string, expiresAt: number): Promise<void> {
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) return;

    const tokenHash = hashMsdkAgentToken(token);

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO msdk_token_revocations (
           token_hash,
           revoked_at,
           expires_at
         )
         VALUES ($1, NOW(), $2)
         ON CONFLICT (token_hash)
         DO UPDATE SET
           revoked_at = EXCLUDED.revoked_at,
           expires_at = GREATEST(
             msdk_token_revocations.expires_at,
             EXCLUDED.expires_at
           )`,
        [tokenHash, new Date(expiresAt)]
      );
    }

    this.revokedUntil.set(tokenHash, expiresAt);
  }

  async assertReady(): Promise<void> {
    if (!this.pool) return;
    await this.pool.query("SELECT 1 FROM msdk_token_revocations LIMIT 1");
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

export function hashMsdkAgentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
