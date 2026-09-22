export type Fh2CockpitPropStyle = "camel" | "snake";

export interface Fh2StandaloneConfig {
  enabled: boolean;
  nativeCockpitEnabled: boolean;
  hostUrl: string;
  serverUrl: string;
  wssUrl: string;
  projectId: string;
  projectToken: string;
  paasUrl: string;
  cockpitPropStyle: Fh2CockpitPropStyle;
  defaultGatewaySn: string;
  defaultDroneSn: string;
  defaultWaylineId: string;
  defaultFlightPathId: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function env(name: keyof ImportMetaEnv): string {
  return String(import.meta.env[name] ?? "").trim();
}

export function readFh2StandaloneConfig(): Fh2StandaloneConfig {
  const hostUrl = trimTrailingSlash(env("VITE_FH2_HOST_URL"));
  const serverUrl = trimTrailingSlash(env("VITE_FH2_SERVER_URL"));
  const wssUrl = trimTrailingSlash(env("VITE_FH2_WSS_URL"));
  const explicitPaasUrl = env("VITE_FH2_PAAS_URL");
  const propStyle = env("VITE_FH2_COCKPIT_PROP_STYLE");

  return {
    enabled: env("VITE_FH2_STANDALONE_ENABLED") === "true",
    nativeCockpitEnabled:
      env("VITE_FH2_NATIVE_COCKPIT_ENABLED") === "true",
    hostUrl,
    serverUrl,
    wssUrl,
    projectId: env("VITE_FH2_PROJECT_ID"),
    projectToken: env("VITE_FH2_PROJECT_TOKEN"),
    paasUrl:
      explicitPaasUrl ||
      (hostUrl ? `${hostUrl}/paas.js` : ""),
    cockpitPropStyle: propStyle === "snake" ? "snake" : "camel",
    defaultGatewaySn: env("VITE_FH2_GATEWAY_SN"),
    defaultDroneSn: env("VITE_FH2_DRONE_SN"),
    defaultWaylineId: env("VITE_FH2_WAYLINE_ID"),
    defaultFlightPathId: env("VITE_FH2_FLIGHT_PATH_ID")
  };
}

export function validateFh2StandaloneConfig(
  config: Fh2StandaloneConfig
): string[] {
  if (!config.enabled) return [];

  const missing: string[] = [];
  if (!config.hostUrl) missing.push("VITE_FH2_HOST_URL");
  if (!config.serverUrl) missing.push("VITE_FH2_SERVER_URL");
  if (!config.wssUrl) missing.push("VITE_FH2_WSS_URL");
  if (!config.projectId) missing.push("VITE_FH2_PROJECT_ID");
  if (!config.projectToken) missing.push("VITE_FH2_PROJECT_TOKEN");
  if (!config.paasUrl) missing.push("VITE_FH2_PAAS_URL");
  return missing;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_FH2_STANDALONE_ENABLED?: string;
    readonly VITE_FH2_NATIVE_COCKPIT_ENABLED?: string;
    readonly VITE_FH2_HOST_URL?: string;
    readonly VITE_FH2_SERVER_URL?: string;
    readonly VITE_FH2_WSS_URL?: string;
    readonly VITE_FH2_PROJECT_ID?: string;
    readonly VITE_FH2_PROJECT_TOKEN?: string;
    readonly VITE_FH2_PAAS_URL?: string;
    readonly VITE_FH2_COCKPIT_PROP_STYLE?: string;
    readonly VITE_FH2_GATEWAY_SN?: string;
    readonly VITE_FH2_DRONE_SN?: string;
    readonly VITE_FH2_WAYLINE_ID?: string;
    readonly VITE_FH2_FLIGHT_PATH_ID?: string;
  }
}
