import type {
  CloudControlAuthRequest,
  DrcSessionGuards,
  DrcSessionManager,
  EnterDrcModeOptions
} from "@fh-clone/adapter-dji-cloud";

export interface DjiControlRuntime {
  resolveGatewaySn(deviceSn: string): string | undefined;
  supportsFlightControl(deviceSn: string): boolean;
  isCloudControlAuthorized(deviceOrGatewaySn: string): boolean;
  drc: {
    requestCloudControlAuthority(gatewaySn: string, request: CloudControlAuthRequest): Promise<unknown>;
    releaseCloudControlAuthority(gatewaySn: string): Promise<unknown>;
    enterDrcMode(gatewaySn: string, options: EnterDrcModeOptions): Promise<unknown>;
  };
}

export interface ControlCoordinatorOptions {
  authorityTimeoutMs?: number;
  authorityPollMs?: number;
}

export class ControlCoordinator {
  private readonly authorityTimeoutMs: number;
  private readonly authorityPollMs: number;

  constructor(
    private readonly dji: DjiControlRuntime,
    private readonly sessions: DrcSessionManager,
    private readonly guards: (aircraftSn: string, holder?: string) => DrcSessionGuards,
    options: ControlCoordinatorOptions = {}
  ) {
    this.authorityTimeoutMs = options.authorityTimeoutMs ?? 15_000;
    this.authorityPollMs = options.authorityPollMs ?? 100;
  }

  async start(input: {
    aircraftSn: string;
    holder: string;
    authority: CloudControlAuthRequest;
    drc: EnterDrcModeOptions;
  }) {
    const gatewaySn = this.dji.resolveGatewaySn(input.aircraftSn);
    if (!gatewaySn) throw new Error("dji_gateway_unknown");
    if (!this.dji.supportsFlightControl(input.aircraftSn)) {
      throw new Error("flight_control_not_supported");
    }

    const initial = this.guards(input.aircraftSn, input.holder);
    if (initial.djiAuthority) throw new Error("dji_cloud_authority_already_held");
    await this.sessions.request({ aircraftSn: input.aircraftSn, gatewaySn, guards: initial });

    let authorityRequested = false;
    let drcEntered = false;
    try {
      await this.dji.drc.requestCloudControlAuthority(gatewaySn, input.authority);
      authorityRequested = true;
      await this.waitForAuthority(gatewaySn);

      const authorized = this.guards(input.aircraftSn, input.holder);
      if (!authorized.fc3 || !authorized.controlLease || !authorized.capability || !authorized.djiAuthority) {
        throw new Error("drc_guards_changed_before_enter");
      }
      await this.dji.drc.enterDrcMode(gatewaySn, input.drc);
      drcEntered = true;
      const finalGuards = this.guards(input.aircraftSn, input.holder);
      return await this.sessions.activate({ gatewaySn, guards: finalGuards });
    } catch (error) {
      if (drcEntered) {
        await this.sessions.closeGracefully(gatewaySn, "activation_failed").catch(() => undefined);
      } else {
        await this.sessions.forceClose(gatewaySn, "activation_failed").catch(() => undefined);
      }
      if (authorityRequested) {
        await this.dji.drc.releaseCloudControlAuthority(gatewaySn).catch(() => undefined);
      }
      throw error;
    }
  }

  async stop(aircraftSn: string, reason = "operator_release") {
    const gatewaySn = this.dji.resolveGatewaySn(aircraftSn);
    if (!gatewaySn) throw new Error("dji_gateway_unknown");
    const closed = await this.sessions.closeGracefully(gatewaySn, reason);
    await this.dji.drc.releaseCloudControlAuthority(gatewaySn);
    return closed;
  }

  private async waitForAuthority(gatewaySn: string): Promise<void> {
    const deadline = Date.now() + this.authorityTimeoutMs;
    while (Date.now() < deadline) {
      if (this.dji.isCloudControlAuthorized(gatewaySn)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, this.authorityPollMs));
    }
    throw new Error("dji_cloud_authority_timeout");
  }
}
