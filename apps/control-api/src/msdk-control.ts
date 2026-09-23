import { randomUUID } from "node:crypto";

import type {
  MsdkAgentIdentity,
  MsdkAgentRecord
} from "./msdk-bridge.js";

export type MsdkControlSessionState =
  | "starting"
  | "active"
  | "stopping"
  | "closed";

export interface MsdkStickFrame {
  leftHorizontal: number;
  leftVertical: number;
  rightHorizontal: number;
  rightVertical: number;
}

export interface MsdkControlSession {
  sessionId: string;
  aircraftSn: string;
  gatewaySn: string;
  holder: string;
  state: MsdkControlSessionState;
  createdAt: number;
  updatedAt: number;
  lastSeq: number;
  reason?: string | undefined;
}

export interface MsdkControlPeer {
  send(text: string): boolean;
  close(code: number, reason: string): void;
}

export interface MsdkControlHubOptions {
  getAgent(aircraftSn: string): MsdkAgentRecord | undefined;
  hasFc3(aircraftSn: string): boolean;
  hasLease(aircraftSn: string, holder: string): boolean;
  now?: (() => number) | undefined;
  agentFreshMs?: number | undefined;
  startTimeoutMs?: number | undefined;
  frameTtlMs?: number | undefined;
  onAudit?: ((event: Record<string, unknown>) => void) | undefined;
}

interface PeerRecord {
  identity: MsdkAgentIdentity;
  peer: MsdkControlPeer;
}

export class MsdkControlHub {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly sessions = new Map<string, MsdkControlSession>();
  private readonly now: () => number;
  private readonly agentFreshMs: number;
  private readonly startTimeoutMs: number;
  private readonly frameTtlMs: number;

  constructor(private readonly options: MsdkControlHubOptions) {
    this.now = options.now ?? Date.now;
    this.agentFreshMs = options.agentFreshMs ?? 3_000;
    this.startTimeoutMs = options.startTimeoutMs ?? 5_000;
    this.frameTtlMs = options.frameTtlMs ?? 250;
  }

  registerPeer(
    identity: MsdkAgentIdentity,
    peer: MsdkControlPeer
  ): void {
    const previous = this.peers.get(identity.aircraftSn);
    if (previous && previous.peer !== peer) {
      previous.peer.close(4001, "replaced_by_new_agent_connection");
    }

    this.peers.set(identity.aircraftSn, { identity, peer });
    this.audit("peer_connected", {
      aircraftSn: identity.aircraftSn,
      gatewaySn: identity.gatewaySn
    });
  }

  unregisterPeer(aircraftSn: string, peer?: MsdkControlPeer): void {
    const current = this.peers.get(aircraftSn);
    if (!current) return;
    if (peer && current.peer !== peer) return;

    this.peers.delete(aircraftSn);
    const session = this.sessions.get(aircraftSn);
    if (session && session.state !== "closed") {
      this.sessions.set(aircraftSn, {
        ...session,
        state: "closed",
        updatedAt: this.now(),
        reason: "agent_transport_lost"
      });
      this.audit("session_closed", {
        ...session,
        reason: "agent_transport_lost"
      });
    }
  }

  openSession(aircraftSn: string, holder: string): MsdkControlSession {
    if (!holder.trim()) throw new Error("msdk_control_holder_required");

    const peerRecord = this.peers.get(aircraftSn);
    if (!peerRecord) throw new Error("msdk_agent_socket_not_connected");

    const agent = this.requireControllableAgent(aircraftSn, holder);
    if (agent.gatewaySn !== peerRecord.identity.gatewaySn) {
      throw new Error("msdk_gateway_identity_mismatch");
    }

    const existing = this.sessions.get(aircraftSn);
    if (
      existing &&
      existing.state !== "closed" &&
      existing.holder !== holder
    ) {
      throw new Error("msdk_control_session_already_held");
    }

    const now = this.now();
    const session: MsdkControlSession = {
      sessionId: randomUUID(),
      aircraftSn,
      gatewaySn: agent.gatewaySn,
      holder,
      state: "starting",
      createdAt: now,
      updatedAt: now,
      lastSeq: 0
    };
    this.sessions.set(aircraftSn, session);

    this.sendJson(peerRecord.peer, {
      type: "session_start",
      sessionId: session.sessionId,
      holder,
      requestedAt: now
    });

    this.audit("session_start_requested", { ...session });
    return { ...session };
  }

  sendStick(
    aircraftSn: string,
    holder: string,
    frame: MsdkStickFrame
  ): number {
    validateFrame(frame);

    const session = this.sessions.get(aircraftSn);
    if (!session || session.state !== "active") {
      throw new Error("msdk_control_session_not_active");
    }
    if (session.holder !== holder) {
      throw new Error("msdk_control_lease_holder_mismatch");
    }

    this.requireControllableAgent(aircraftSn, holder);
    const peer = this.peers.get(aircraftSn)?.peer;
    if (!peer) throw new Error("msdk_agent_socket_not_connected");

    const seq = session.lastSeq + 1;
    const now = this.now();

    this.sendJson(peer, {
      type: "stick",
      sessionId: session.sessionId,
      seq,
      sentAt: now,
      expiresAt: now + this.frameTtlMs,
      frame
    });

    this.sessions.set(aircraftSn, {
      ...session,
      updatedAt: now,
      lastSeq: seq
    });

    return seq;
  }

  closeSession(
    aircraftSn: string,
    reason = "operator_release"
  ): void {
    const session = this.sessions.get(aircraftSn);
    if (!session || session.state === "closed") return;

    const peer = this.peers.get(aircraftSn)?.peer;
    const now = this.now();

    this.sessions.set(aircraftSn, {
      ...session,
      state: "stopping",
      updatedAt: now,
      reason
    });

    if (peer) {
      this.sendJson(peer, {
        type: "neutral",
        sessionId: session.sessionId,
        reason
      });
      this.sendJson(peer, {
        type: "session_stop",
        sessionId: session.sessionId,
        reason
      });
    }

    this.sessions.set(aircraftSn, {
      ...session,
      state: "closed",
      updatedAt: this.now(),
      reason
    });
    this.audit("session_closed", { ...session, reason });
  }

  handleAgentMessage(aircraftSn: string, text: string): void {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      throw new Error("invalid_msdk_control_message");
    }
    if (!isRecord(message) || typeof message.type !== "string") {
      throw new Error("invalid_msdk_control_message");
    }

    const session = this.sessions.get(aircraftSn);

    if (message.type === "session_ready") {
      if (
        !session ||
        session.state !== "starting" ||
        message.sessionId !== session.sessionId
      ) {
        throw new Error("unexpected_msdk_session_ready");
      }
      if (message.authorityOwner !== "MSDK") {
        this.closeSession(aircraftSn, "msdk_authority_not_owned");
        return;
      }

      this.requireControllableAgent(aircraftSn, session.holder);
      const now = this.now();
      this.sessions.set(aircraftSn, {
        ...session,
        state: "active",
        updatedAt: now
      });
      this.audit("session_active", { ...session });
      return;
    }

    if (message.type === "session_rejected") {
      if (
        session &&
        typeof message.sessionId === "string" &&
        message.sessionId === session.sessionId
      ) {
        this.closeSession(
          aircraftSn,
          typeof message.reason === "string"
            ? message.reason
            : "agent_rejected"
        );
      }
      return;
    }

    if (message.type === "session_stopped") {
      if (
        session &&
        typeof message.sessionId === "string" &&
        message.sessionId === session.sessionId
      ) {
        this.sessions.set(aircraftSn, {
          ...session,
          state: "closed",
          updatedAt: this.now(),
          reason:
            typeof message.reason === "string"
              ? message.reason
              : "agent_stopped"
        });
      }
      return;
    }

    if (message.type === "pong") return;

    throw new Error("unsupported_msdk_control_message");
  }

  tick(): void {
    const now = this.now();

    for (const [aircraftSn, session] of this.sessions) {
      if (session.state === "closed") continue;

      if (
        session.state === "starting" &&
        now - session.createdAt > this.startTimeoutMs
      ) {
        this.closeSession(aircraftSn, "session_start_timeout");
        continue;
      }

      try {
        this.requireControllableAgent(aircraftSn, session.holder);
      } catch (error) {
        this.closeSession(
          aircraftSn,
          error instanceof Error ? error.message : "guard_lost"
        );
      }
    }
  }

  getSession(aircraftSn: string): MsdkControlSession | undefined {
    const session = this.sessions.get(aircraftSn);
    return session ? { ...session } : undefined;
  }

  listSessions(): MsdkControlSession[] {
    return [...this.sessions.values()].map((entry) => ({ ...entry }));
  }

  private requireControllableAgent(
    aircraftSn: string,
    holder: string
  ): MsdkAgentRecord {
    const agent = this.options.getAgent(aircraftSn);
    if (!agent) throw new Error("msdk_agent_not_paired");
    if (this.now() - agent.lastSeenAt > this.agentFreshMs) {
      throw new Error("msdk_agent_stale");
    }
    if (!agent.snapshot.control.networkArmed) {
      throw new Error("msdk_network_control_not_armed");
    }
    if (!agent.snapshot.capabilities.virtualStick) {
      throw new Error("msdk_virtual_stick_not_supported");
    }
    if (!this.options.hasFc3(aircraftSn)) {
      throw new Error("fc3_required");
    }
    if (!this.options.hasLease(aircraftSn, holder)) {
      throw new Error("control_lease_required");
    }
    return agent;
  }

  private sendJson(
    peer: MsdkControlPeer,
    body: Record<string, unknown>
  ): void {
    if (!peer.send(JSON.stringify(body))) {
      throw new Error("msdk_agent_socket_send_failed");
    }
  }

  private audit(
    event: string,
    data: Record<string, unknown>
  ): void {
    this.options.onAudit?.({
      event,
      at: this.now(),
      ...data
    });
  }
}

function validateFrame(frame: MsdkStickFrame): void {
  for (const [name, value] of Object.entries(frame)) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < -1 ||
      value > 1
    ) {
      throw new RangeError(
        `msdk_stick_${name}_out_of_range`
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
