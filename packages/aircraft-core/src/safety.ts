import type { AircraftCommand, Capability } from "./types.js";

export type FlightControlStage = "FC0" | "FC1" | "FC2" | "FC3";
export type CommandRiskClass = "SAFE" | "CONTROLLED_WRITE" | "DANGEROUS";

export interface SafetyDecision {
  allowed: boolean;
  requiredStage: FlightControlStage;
  risk: CommandRiskClass;
  reason: string;
}

const STAGE_ORDER: Record<FlightControlStage, number> = {
  FC0: 0,
  FC1: 1,
  FC2: 2,
  FC3: 3
};

export function classifyCapability(capability: Capability): {
  stage: FlightControlStage;
  risk: CommandRiskClass;
} {
  if (
    capability === "control.flight" ||
    capability === "control.rth" ||
    capability === "control.pointing" ||
    capability === "control.orbit"
  ) {
    return { stage: "FC3", risk: "DANGEROUS" };
  }

  if (capability === "mission.wayline") {
    return { stage: "FC2", risk: "DANGEROUS" };
  }

  if (
    capability === "control.camera" ||
    capability === "control.gimbal" ||
    capability === "payload.control"
  ) {
    return { stage: "FC1", risk: "CONTROLLED_WRITE" };
  }

  return { stage: "FC1", risk: "CONTROLLED_WRITE" };
}

/**
 * Gemeinsamer FH2-Manager/FH-Clone Sicherheitsvertrag.
 *
 * FC0: Analyse/Verträge/read-only, keine realen Downlinks.
 * FC1: kontrollierte nicht-fliegende Downlinks.
 * FC2: Mission/Task Control.
 * FC3: RTH/Aircraft Control/DRC.
 *
 * Default bleibt FC0. Eine höhere Stufe muss zur Laufzeit bewusst gesetzt
 * werden; Quellcode-Präsenz aktiviert keine Funktion.
 */
export class SafetyGate {
  private stage: FlightControlStage = "FC0";
  private killSwitch = false;

  get currentStage(): FlightControlStage {
    return this.stage;
  }

  get isKillSwitchActive(): boolean {
    return this.killSwitch;
  }

  setStage(stage: FlightControlStage): void {
    this.stage = stage;
  }

  setKillSwitch(active: boolean): void {
    this.killSwitch = active;
  }

  authorize(command: AircraftCommand, now = Date.now()): SafetyDecision {
    const classification = classifyCapability(command.capability);

    if (this.killSwitch) {
      return {
        allowed: false,
        requiredStage: classification.stage,
        risk: classification.risk,
        reason: "Global flight-control kill switch is active"
      };
    }

    if (command.timeoutMs <= 0) {
      return {
        allowed: false,
        requiredStage: classification.stage,
        risk: classification.risk,
        reason: "Command timeout must be greater than zero"
      };
    }

    if (!command.correlationId.trim()) {
      return {
        allowed: false,
        requiredStage: classification.stage,
        risk: classification.risk,
        reason: "Command correlationId is required"
      };
    }

    if (STAGE_ORDER[this.stage] < STAGE_ORDER[classification.stage]) {
      return {
        allowed: false,
        requiredStage: classification.stage,
        risk: classification.risk,
        reason:
          `Command requires ${classification.stage}; current safety stage is ${this.stage}`
      };
    }

    return {
      allowed: true,
      requiredStage: classification.stage,
      risk: classification.risk,
      reason: `Allowed at ${this.stage} (checked ${now})`
    };
  }
}
