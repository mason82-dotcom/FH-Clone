export {};

interface DjiBridgeRuntime {
  platformGetVersion(): unknown;
  platformIsVerified(): unknown;
  platformVerifyLicense(appId: string, appKey: string, license: string): unknown;
  platformGetRemoteControllerSN(): unknown;
  platformGetAircraftSN(): unknown;
  platformIsComponentLoaded(name: string): unknown;
  platformLoadComponent(name: string, param: string): unknown;
  platformSetWorkspaceId(workspaceId: string): unknown;
  platformSetInformation(
    platformName: string,
    workspaceName: string,
    description: string
  ): unknown;
  thingGetConnectState(): unknown;
  wsGetConnectState(): unknown;
  onBackClick?: () => boolean;
  onStopPlatform?: () => void;
}

declare global {
  interface Window {
    djiBridge?: DjiBridgeRuntime;
    fh2ThingConnectCallback?: (value: unknown) => void;
  }
}
