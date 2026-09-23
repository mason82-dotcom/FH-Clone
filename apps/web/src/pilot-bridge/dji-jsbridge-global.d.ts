export {};

interface DjiBridgeRuntime {
  platformGetVersion(): unknown;
  platformIsVerified(): unknown;
  platformGetRemoteControllerSN(): unknown;
  platformGetAircraftSN(): unknown;
  platformIsComponentLoaded(name: string): unknown;
  thingGetConnectState(): unknown;
  wsGetConnectState(): unknown;
}

declare global {
  interface Window {
    djiBridge?: DjiBridgeRuntime;
  }
}
