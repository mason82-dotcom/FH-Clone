export interface DjiPilotBridgeConfig {
  enabled: boolean;
  verifyLicense: boolean;
  appId: string;
  appKey: string;
  license: string;
  workspaceId: string;
  platformName: string;
  workspaceName: string;
  workspaceDescription: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function env(name: keyof ImportMetaEnv): string {
  return String(import.meta.env[name] ?? "").trim();
}

export function readDjiPilotBridgeConfig(): DjiPilotBridgeConfig {
  return {
    enabled: env("VITE_DJI_JSBRIDGE_ENABLED") === "true",
    verifyLicense: env("VITE_DJI_JSBRIDGE_VERIFY_LICENSE") !== "false",
    appId: env("VITE_DJI_JSBRIDGE_APP_ID"),
    appKey: env("VITE_DJI_JSBRIDGE_APP_KEY"),
    license: env("VITE_DJI_JSBRIDGE_LICENSE"),
    workspaceId: env("VITE_DJI_JSBRIDGE_WORKSPACE_ID"),
    platformName: env("VITE_DJI_JSBRIDGE_PLATFORM_NAME") || "FH2",
    workspaceName: env("VITE_DJI_JSBRIDGE_WORKSPACE_NAME") || "FH2",
    workspaceDescription:
      env("VITE_DJI_JSBRIDGE_WORKSPACE_DESCRIPTION") ||
      "FH2 Enterprise Flight Console"
  };
}

export function validateDjiPilotBridgeConfig(
  config: DjiPilotBridgeConfig
): string[] {
  if (!config.enabled) return [];

  const errors: string[] = [];

  if (config.verifyLicense) {
    if (!config.appId) errors.push("VITE_DJI_JSBRIDGE_APP_ID");
    if (!config.appKey) errors.push("VITE_DJI_JSBRIDGE_APP_KEY");
    if (!config.license) errors.push("VITE_DJI_JSBRIDGE_LICENSE");
  }

  if (config.workspaceId && !UUID_PATTERN.test(config.workspaceId)) {
    errors.push("VITE_DJI_JSBRIDGE_WORKSPACE_ID (UUID erwartet)");
  }

  return errors;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_DJI_JSBRIDGE_ENABLED?: string;
    readonly VITE_DJI_JSBRIDGE_VERIFY_LICENSE?: string;
    readonly VITE_DJI_JSBRIDGE_APP_ID?: string;
    readonly VITE_DJI_JSBRIDGE_APP_KEY?: string;
    readonly VITE_DJI_JSBRIDGE_LICENSE?: string;
    readonly VITE_DJI_JSBRIDGE_WORKSPACE_ID?: string;
    readonly VITE_DJI_JSBRIDGE_PLATFORM_NAME?: string;
    readonly VITE_DJI_JSBRIDGE_WORKSPACE_NAME?: string;
    readonly VITE_DJI_JSBRIDGE_WORKSPACE_DESCRIPTION?: string;
  }
}
