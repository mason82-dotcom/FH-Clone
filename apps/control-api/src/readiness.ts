export type ReadinessDependencyState =
  | "disabled"
  | "ready"
  | "unavailable";

export interface ReadinessDependencyInput {
  configured: boolean;
  ready: boolean;
}

export interface ReadinessDependencyView {
  configured: boolean;
  ready: boolean;
  state: ReadinessDependencyState;
}

export interface ControlApiReadinessInput {
  mqttBackend: ReadinessDependencyInput;
  topologyStore: ReadinessDependencyInput;
  gatewayCredentialStore: ReadinessDependencyInput;
  missionStore: ReadinessDependencyInput;
  mediaStore: ReadinessDependencyInput;
}

export interface ControlApiReadiness {
  ready: boolean;
  checks: {
    mqttBackend: ReadinessDependencyView;
    topologyStore: ReadinessDependencyView;
    gatewayCredentialStore: ReadinessDependencyView;
    missionStore: ReadinessDependencyView;
    mediaStore: ReadinessDependencyView;
  };
}

export function evaluateControlApiReadiness(
  input: ControlApiReadinessInput
): ControlApiReadiness {
  const checks = {
    mqttBackend: dependencyView(input.mqttBackend),
    topologyStore: dependencyView(input.topologyStore),
    gatewayCredentialStore: dependencyView(input.gatewayCredentialStore),
    missionStore: dependencyView(input.missionStore),
    mediaStore: dependencyView(input.mediaStore)
  };

  return {
    ready: Object.values(checks).every(
      (check) => check.state !== "unavailable"
    ),
    checks
  };
}

function dependencyView(
  input: ReadinessDependencyInput
): ReadinessDependencyView {
  if (!input.configured) {
    return {
      configured: false,
      ready: false,
      state: "disabled"
    };
  }

  if (input.ready) {
    return {
      configured: true,
      ready: true,
      state: "ready"
    };
  }

  return {
    configured: true,
    ready: false,
    state: "unavailable"
  };
}
