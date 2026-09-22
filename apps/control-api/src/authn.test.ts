import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateEmqx,
  hashGatewayPassword,
  isEmqxAuthenticationRequest,
  verifyGatewayPassword,
  type GatewayCredentialStore
} from "./authn.js";

class MemoryCredentialStore implements GatewayCredentialStore {
  constructor(
    private readonly credential:
      | {
          principalId: string;
          username: string;
          passwordHash: string;
          gatewaySn: string;
          enabled: boolean;
        }
      | undefined
  ) {}

  async findByUsername(username: string) {
    return this.credential?.username === username
      ? this.credential
      : undefined;
  }

  async isActiveBinding(username: string, gatewaySn: string): Promise<boolean> {
    return Boolean(
      this.credential?.enabled &&
        this.credential.username === username &&
        this.credential.gatewaySn === gatewaySn
    );
  }
}

test("validates EMQX authentication request", () => {
  assert.equal(
    isEmqxAuthenticationRequest({
      username: "dji-gateway-RC-1",
      password: "secret",
      clientid: "session-1",
      peerhost: "10.0.0.10"
    }),
    true
  );

  assert.equal(
    isEmqxAuthenticationRequest({
      username: "dji-gateway-RC-1",
      clientid: "session-1"
    }),
    false
  );
});

test("scrypt gateway password roundtrip", async () => {
  const hash = await hashGatewayPassword("correct horse battery staple");
  assert.equal(
    await verifyGatewayPassword("correct horse battery staple", hash),
    true
  );
  assert.equal(await verifyGatewayPassword("wrong", hash), false);
});

test("gateway auth returns trusted gateway attributes", async () => {
  const passwordHash = await hashGatewayPassword("gateway-secret");
  const store = new MemoryCredentialStore({
    principalId: "11111111-1111-4111-8111-111111111111",
    username: "dji-gateway-rc1",
    passwordHash,
    gatewaySn: "RC-PRO-001",
    enabled: true
  });

  assert.deepEqual(
    await authenticateEmqx(
      store,
      {
        username: "dji-gateway-rc1",
        password: "gateway-secret",
        clientid: "arbitrary-session-id"
      },
      undefined
    ),
    {
      result: "allow",
      is_superuser: false,
      client_attrs: {
        role: "dji_gateway",
        gateway_sn: "RC-PRO-001"
      }
    }
  );
});

test("gateway auth denies disabled and invalid credentials", async () => {
  const passwordHash = await hashGatewayPassword("gateway-secret");
  const disabled = new MemoryCredentialStore({
    principalId: "11111111-1111-4111-8111-111111111111",
    username: "dji-gateway-rc1",
    passwordHash,
    gatewaySn: "RC-PRO-001",
    enabled: false
  });

  assert.deepEqual(
    await authenticateEmqx(
      disabled,
      {
        username: "dji-gateway-rc1",
        password: "gateway-secret",
        clientid: "session"
      },
      undefined
    ),
    { result: "deny", is_superuser: false }
  );

  const enabled = new MemoryCredentialStore({
    principalId: "11111111-1111-4111-8111-111111111111",
    username: "dji-gateway-rc1",
    passwordHash,
    gatewaySn: "RC-PRO-001",
    enabled: true
  });

  assert.deepEqual(
    await authenticateEmqx(
      enabled,
      {
        username: "dji-gateway-rc1",
        password: "wrong",
        clientid: "session"
      },
      undefined
    ),
    { result: "deny", is_superuser: false }
  );
});

test("backend service is authenticated only by configured secret", async () => {
  assert.equal(
    (
      await authenticateEmqx(
        undefined,
        {
          username: "backend-service",
          password: "backend-secret",
          clientid: "fh-clone-backend"
        },
        "backend-secret"
      )
    ).result,
    "allow"
  );

  assert.equal(
    (
      await authenticateEmqx(
        undefined,
        {
          username: "backend-service",
          password: "wrong",
          clientid: "fh-clone-backend"
        },
        "backend-secret"
      )
    ).result,
    "deny"
  );
});
