import type {
  PilotCloudAuthorityRequest,
  DrcSessionGuards,
  DrcSessionManager,
  EnterDrcModeOptions
} from "@fh-clone/adapter-dji-cloud";

export interface DjiControlRuntime {
  resolveGatewaySn(deviceSn: string): string | undefined;
  supportsFlightControl(deviceSn: string): boolean;
  connectDrcTransport(credentials: EnterDrcModeOptions["mqttBroker"]): Promise<void>;
  disconnectDrcTransport(): Promise<void>;
  pilotAuthority: {
    requestFlightAuthority(gatewaySn: string, request: PilotCloudAuthorityRequest): Promise<unknown>;
    releaseFlightAuthority(gatewaySn: string): Promise<unknown>;
  };
  drc: {
    enterDrcMode(gatewaySn: string, options: EnterDrcModeOptions): Promise<unknown>;
  };
}

export interface ControlCoordinatorOptions {
  authorityTimeoutMs?: number;
  credentialSafetyWindowS?: number;
}

export class ControlCoordinator {
  private readonly authorityTimeoutMs: number;
  private readonly credentialSafetyWindowS: number;
  private readonly runtime = new Map<string, { holder: string; credentials: EnterDrcModeOptions["mqttBroker"] }>();

  constructor(
    private readonly dji: DjiControlRuntime,
    private readonly sessions: DrcSessionManager,
    private readonly guards: (aircraftSn: string, holder?: string) => DrcSessionGuards,
    options: ControlCoordinatorOptions = {}
  ) {
    this.authorityTimeoutMs = options.authorityTimeoutMs ?? 15_000;
    this.credentialSafetyWindowS = options.credentialSafetyWindowS ?? 15;
  }

  async start(input: {
    aircraftSn: string;
    holder: string;
    authority: PilotCloudAuthorityRequest;
    drc: EnterDrcModeOptions;
  }) {
    const gatewaySn = this.dji.resolveGatewaySn(input.aircraftSn);
    if (!gatewaySn) throw new Error("dji_gateway_unknown");
    if (!this.dji.supportsFlightControl(input.aircraftSn)) {
      throw new Error("flight_control_not_supported");
    }

    const openSessions = await this.sessions.listOpenSessions();
    if (openSessions.some((session) => session.gatewaySn !== gatewaySn)) {
      throw new Error("drc_session_already_active");
    }

    const initial = this.guards(input.aircraftSn, input.holder);
    if (initial.djiAuthority) throw new Error("dji_cloud_authority_already_held");
    await this.sessions.request({ aircraftSn: input.aircraftSn, gatewaySn, holder: input.holder, guards: initial });

    let authorityRequested = false;
    let drcEntered = false;
    try {
      authorityRequested = true;
      await this.dji.pilotAuthority.requestFlightAuthority(gatewaySn, { ...input.authority, timeoutMs: this.authorityTimeoutMs });
      await this.sessions.markAuthorized(gatewaySn);

      const authorized = this.guards(input.aircraftSn, input.holder);
      if (!authorized.fc3 || !authorized.controlLease || !authorized.capability || !authorized.djiAuthority) {
        throw new Error("drc_guards_changed_before_enter");
      }
      await this.sessions.markAuthorityGrabbed(gatewaySn);
      await this.dji.drc.enterDrcMode(gatewaySn, input.drc);
      drcEntered = true;
      await this.sessions.markDrcModeActive(gatewaySn);
      await this.dji.connectDrcTransport(input.drc.mqttBroker);
      await this.sessions.setTransportConnected(gatewaySn, true);
      const finalGuards = this.guards(input.aircraftSn, input.holder);
      const activated = await this.sessions.activate({ gatewaySn, guards: finalGuards });
      this.runtime.set(gatewaySn, { holder: input.holder, credentials: input.drc.mqttBroker });
      return activated;
    } catch (error) {
      if (drcEntered) {
        await this.sessions.closeGracefully(gatewaySn, "activation_failed").catch(() => undefined);
      } else {
        await this.sessions.forceClose(gatewaySn, "activation_failed").catch(() => undefined);
      }
      await this.dji.disconnectDrcTransport().catch(() => undefined);
      if (authorityRequested) {
        await this.dji.pilotAuthority.releaseFlightAuthority(gatewaySn).catch(() => undefined);
      }
      throw error;
    }
  }

  async stop(aircraftSn: string, reason = "operator_release") {
    const gatewaySn = this.dji.resolveGatewaySn(aircraftSn);
    if (!gatewaySn) throw new Error("dji_gateway_unknown");
    this.runtime.delete(gatewaySn);
    let closed;
    try {
      closed = await this.sessions.closeGracefully(gatewaySn, reason);
    } finally {
      await this.dji.disconnectDrcTransport().catch(() => undefined);
      await this.dji.pilotAuthority.releaseFlightAuthority(gatewaySn).catch(() => undefined);
    }
    return closed;
  }

  async recoverTransport(aircraftSn: string): Promise<boolean> {
    const gatewaySn = this.dji.resolveGatewaySn(aircraftSn);
    if (!gatewaySn) return false;
    const runtime = this.runtime.get(gatewaySn);
    if (!runtime) return false;
    const guards = this.guards(aircraftSn, runtime.holder);
    if (!guards.fc3 || !guards.controlLease || !guards.capability || !guards.djiAuthority) return false;
    if (await this.sessions.getDrcStatus(gatewaySn) !== 2) return false;
    const nowS = Math.floor(Date.now() / 1000);
    if (runtime.credentials.expire_time <= nowS + this.credentialSafetyWindowS) return false;
    await this.dji.connectDrcTransport(runtime.credentials);
    await this.sessions.setTransportConnected(gatewaySn, true);
    return true;
  }

}
