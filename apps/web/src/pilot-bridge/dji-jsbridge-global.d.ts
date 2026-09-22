export {};

interface DjiBridgeRuntime {
  platformSetWorkspaceId(uuid: string): unknown;
  platformSetInformation(
    platformName: string,
    workspaceName: string,
    desc: string
  ): unknown;
  platformGetRemoteControllerSN(): unknown;
  platformGetAircraftSN(): unknown;
  platformStopSelf(): unknown;

  platformGetVersion(): unknown;
  platformIsVerified(): unknown;
  platformVerifyLicense(appId: string, appKey: string, license: string): unknown;

  platformLoadComponent(name: string, param: string): unknown;
  platformUnloadComponent(name: string): unknown;
  platformIsComponentLoaded(name: string): unknown;
  platformIsAppInstalled(pkgName: string): unknown;

  apiSetToken(token: string): unknown;
  apiGetToken(): unknown;
  apiGetHost(): unknown;

  thingGetConnectState(): unknown;
  thingConnect(userName: string, passwd: string, callback: string): unknown;
  thingDisconnect(): unknown;
  thingSetConnectCallback(callback: string): unknown;
  thingGetConfigs(): unknown;

  liveshareGetConfig(): unknown;
  liveshareSetConfig(type: number, params: string): unknown;
  liveshareSetStatusCallback(callback: string): unknown;
  liveshareGetStatus(): unknown;
  liveshareStartLive(): unknown;
  liveshareStopLive(): unknown;

  wsGetConnectState(): unknown;
  wsConnect(host: string, token: string, callback: string): unknown;
  wsDisconnect(): unknown;
  wsSend(message: string): unknown;

  mapSetUserName(userName: string): unknown;
  mapSetElementPreName(prefix: string): unknown;

  mediaSetAutoUploadPhoto(auto: boolean): unknown;
  mediaGetAutoUploadPhoto(): unknown;
  mediaSetUploadPhotoType(type: number): unknown;
  mediaGetUploadPhotoType(): unknown;
  mediaSetAutoUploadVideo(auto: boolean): unknown;
  mediaGetAutoUploadVideo(): unknown;
  mediaSetDownloadOwner(rc: number): unknown;
  mediaGetDownloadOwner(): unknown;

  platformSetLogEncryptKey(key: string): unknown;
  platformClearLogEncryptKey(): unknown;
  platformGetLogPath(): unknown;
}

declare global {
  interface Window {
    djiBridge?: DjiBridgeRuntime;
    liveshare?: {
      setVideoPublishType?(type: string): unknown;
    };
  }
}
