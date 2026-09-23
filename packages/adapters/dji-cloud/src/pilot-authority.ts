import { DJI_CLOUD_CONTROL_ENABLED } from "./capabilities.js";
import type {
  DjiCloudControlAuthorityRegistry,
  DjiCloudControlAuthorityState
} from "./cloud-authority.js";
import type { DjiServiceRequester } from "./service.js";

export interface PilotCloudAuthorityRequest {
  userId: string;
  userCallsign: string;
  timeoutMs?: number;
}

export class PilotCloudAuthorityError extends Error {
  constructor(
    message: string,
    readonly state?: DjiCloudControlAuthorityState
  ) {
    super(message);
    this.name = "PilotCloudAuthorityError";
  }
}

/**
 * Owns the DJI Pilot Cloud consent flow:
 *
 * cloud_control_auth_request
 *   -> RC popup
 *   -> cloud_control_auth_notify(status=ok|failed|canceled)
 *
 * The services_reply only confirms that the request itself was accepted by
 * the protocol. It does not replace the pilot-consent event.
 */
export class DjiPilotCloudAuthorityCoordinator {
  private readonly pending = new Map<
    string,
    Promise<DjiCloudControlAuthorityState>
  >();

  constructor(
    private readonly services: DjiServiceRequester,
    private readonly registry: DjiCloudControlAuthorityRegistry
  ) {}

  requestFlightAuthority(
    gatewaySn: string,
    input: PilotCloudAuthorityRequest
  ): Promise<DjiCloudControlAuthorityState> {
    if (!DJI_CLOUD_CONTROL_ENABLED) {
      return Promise.reject(new PilotCloudAuthorityError("dji_cloud_control_disabled"));
    }
    const existing = this.pending.get(gatewaySn);
    if (existing) return existing;

    const operation = this.runRequest(gatewaySn, input).finally(() => {
      this.pending.delete(gatewaySn);
    });

    this.pending.set(gatewaySn, operation);
    return operation;
  }

  async releaseFlightAuthority(
    gatewaySn: string,
    timeoutMs = 10_000
  ): Promise<DjiCloudControlAuthorityState> {
    if (!DJI_CLOUD_CONTROL_ENABLED) {
      throw new PilotCloudAuthorityError("dji_cloud_control_disabled");
    }
    const reply = await this.services.requestService(
      gatewaySn,
      "cloud_control_release",
      { control_keys: ["flight"] },
      timeoutMs
    );

    if (reply.result !== 0) {
      throw new PilotCloudAuthorityError(
        `DJI cloud_control_release failed with result ${reply.result}`
      );
    }

    return this.registry.markReleased(gatewaySn);
  }

  private async runRequest(
    gatewaySn: string,
    input: PilotCloudAuthorityRequest
  ): Promise<DjiCloudControlAuthorityState> {
    const userId = input.userId.trim();
    const userCallsign = input.userCallsign.trim();
    const timeoutMs = input.timeoutMs ?? 30_000;

    if (!userId) {
      throw new PilotCloudAuthorityError("Cloud-control userId is required");
    }
    if (!userCallsign) {
      throw new PilotCloudAuthorityError("Cloud-control userCallsign is required");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new PilotCloudAuthorityError(
        "Cloud-control authorization timeout must be greater than zero"
      );
    }

    this.registry.markPending(gatewaySn);

    // Subscribe before sending the service request so a very fast Pilot event
    // cannot race past the waiter.
    const outcome = this.registry.waitForTerminal(gatewaySn, timeoutMs);

    try {
      const reply = await this.services.requestService(
        gatewaySn,
        "cloud_control_auth_request",
        {
          user_id: userId,
          user_callsign: userCallsign,
          control_keys: ["flight"]
        },
        Math.min(timeoutMs, 10_000)
      );

      if (reply.result !== 0) {
        const denied = this.registry.markDenied(
          gatewaySn,
          Date.now(),
          reply.result
        );
        throw new PilotCloudAuthorityError(
          `DJI cloud_control_auth_request failed with result ${reply.result}`,
          denied
        );
      }
    } catch (error) {
      const current = this.registry.get(gatewaySn);
      if (current?.status === "pending") {
        this.registry.markDenied(gatewaySn);
      }
      throw error;
    }

    const state = await outcome;
    if (!state.authorized) {
      throw new PilotCloudAuthorityError(
        `Pilot cloud-control authorization ended with status ${state.status}`,
        state
      );
    }

    return state;
  }
}
