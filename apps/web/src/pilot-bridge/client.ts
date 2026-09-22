export type DjiPilotModuleName =
  | "thing"
  | "liveshare"
  | "api"
  | "ws"
  | "map"
  | "tsa"
  | "media"
  | "mission";

export interface DjiPilotVersion {
  modelVersion?: string;
  appVersion?: string;
  [key: string]: unknown;
}

export interface DjiPilotIdentity {
  remoteControllerSn?: string;
  aircraftSn?: string;
}

export interface DjiThingModuleConfig {
  host: string;
  connectCallback: string;
  username: string;
  password: string;
}

export interface DjiLiveShareModuleConfig {
  videoPublishType:
    | "video-on-demand"
    | "video-by-manual"
    | "video-demand-aux-manual";
  statusCallback: string;
}

export interface DjiApiModuleConfig {
  host: string;
  token: string;
}

export interface DjiWsModuleConfig {
  host: string;
  token: string;
  connectCallback: string;
}

export interface DjiMapModuleConfig {
  userName: string;
  elementPreName: string;
}

export interface DjiMediaModuleConfig {
  autoUploadPhoto?: boolean;
  autoUploadPhotoType?: 0 | 1;
  autoUploadVideo?: boolean;
}

interface DjiBridgeEnvelope {
  code: number;
  message?: string;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeRaw(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function unwrap(raw: unknown, operation: string): unknown {
  const decoded = decodeRaw(raw);

  if (!isRecord(decoded) || typeof decoded.code !== "number") {
    return decoded;
  }

  const envelope = decoded as unknown as DjiBridgeEnvelope;
  if (envelope.code !== 0) {
    throw new Error(
      `DJI JSBridge ${operation} fehlgeschlagen (${envelope.code}): ${envelope.message ?? "ohne Fehlermeldung"}`
    );
  }

  return envelope.data;
}

function asBoolean(value: unknown): boolean {
  const decoded = decodeRaw(value);
  if (typeof decoded === "boolean") return decoded;
  if (typeof decoded === "number") return decoded !== 0;
  if (typeof decoded === "string") return decoded.toLowerCase() === "true";
  if (isRecord(decoded) && typeof decoded.data === "boolean") {
    return decoded.data;
  }
  return false;
}

function asString(value: unknown): string | undefined {
  const decoded = decodeRaw(value);
  if (typeof decoded === "string") {
    const trimmed = decoded.trim();
    return trimmed || undefined;
  }
  if (isRecord(decoded) && typeof decoded.data === "string") {
    const trimmed = decoded.data.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function runtime(): NonNullable<Window["djiBridge"]> {
  if (!window.djiBridge) {
    throw new Error("DJI Pilot 2 JSBridge ist in diesem WebView nicht verfügbar");
  }
  return window.djiBridge;
}

/**
 * Thin typed wrapper around the official DJI Pilot 2 window.djiBridge API.
 *
 * This class does not invent module configuration and never persists MQTT,
 * API, WebSocket or live-stream credentials. Callers must obtain those
 * parameters from their authoritative runtime source.
 */
export class DjiPilotBridgeClient {
  isAvailable(): boolean {
    return Boolean(window.djiBridge);
  }

  getVersion(): DjiPilotVersion | undefined {
    const value = unwrap(runtime().platformGetVersion(), "platformGetVersion");
    return isRecord(value) ? (value as DjiPilotVersion) : undefined;
  }

  isVerified(): boolean {
    return asBoolean(
      unwrap(runtime().platformIsVerified(), "platformIsVerified")
    );
  }

  verifyLicense(appId: string, appKey: string, license: string): void {
    unwrap(
      runtime().platformVerifyLicense(appId, appKey, license),
      "platformVerifyLicense"
    );
  }

  setWorkspaceId(workspaceId: string): void {
    unwrap(
      runtime().platformSetWorkspaceId(workspaceId),
      "platformSetWorkspaceId"
    );
  }

  setInformation(
    platformName: string,
    workspaceName: string,
    description: string
  ): void {
    unwrap(
      runtime().platformSetInformation(
        platformName,
        workspaceName,
        description
      ),
      "platformSetInformation"
    );
  }

  getIdentity(): DjiPilotIdentity {
    return {
      remoteControllerSn: asString(
        unwrap(
          runtime().platformGetRemoteControllerSN(),
          "platformGetRemoteControllerSN"
        )
      ),
      aircraftSn: asString(
        unwrap(runtime().platformGetAircraftSN(), "platformGetAircraftSN")
      )
    };
  }

  loadComponent(
    name: DjiPilotModuleName,
    params: Record<string, unknown>
  ): void {
    unwrap(
      runtime().platformLoadComponent(name, JSON.stringify(params)),
      `platformLoadComponent(${name})`
    );
  }

  unloadComponent(name: DjiPilotModuleName): void {
    unwrap(
      runtime().platformUnloadComponent(name),
      `platformUnloadComponent(${name})`
    );
  }

  isComponentLoaded(name: DjiPilotModuleName): boolean {
    return asBoolean(
      unwrap(
        runtime().platformIsComponentLoaded(name),
        `platformIsComponentLoaded(${name})`
      )
    );
  }

  isAppInstalled(packageName: string): boolean {
    return asBoolean(
      unwrap(
        runtime().platformIsAppInstalled(packageName),
        "platformIsAppInstalled"
      )
    );
  }

  private requireLoaded(
    operation: string,
    modules: readonly DjiPilotModuleName[]
  ): void {
    const missing = modules.filter((module) => !this.isComponentLoaded(module));
    if (missing.length > 0) {
      throw new Error(
        `DJI JSBridge ${operation} benötigt geladene Module: ${missing.join(", ")}`
      );
    }
  }

  loadThing(config: DjiThingModuleConfig): void {
    this.loadComponent("thing", config as unknown as Record<string, unknown>);
  }

  loadLiveShare(config: DjiLiveShareModuleConfig): void {
    this.loadComponent(
      "liveshare",
      config as unknown as Record<string, unknown>
    );
  }

  loadApi(config: DjiApiModuleConfig): void {
    this.loadComponent("api", config as unknown as Record<string, unknown>);
  }

  loadWs(config: DjiWsModuleConfig): void {
    this.loadComponent("ws", config as unknown as Record<string, unknown>);
  }

  loadMap(config: DjiMapModuleConfig): void {
    this.requireLoaded("loadMap", ["thing", "ws", "api"]);
    this.loadComponent("map", config as unknown as Record<string, unknown>);
  }

  loadTsa(): void {
    this.requireLoaded("loadTsa", ["thing", "ws", "api"]);
    this.loadComponent("tsa", {});
  }

  loadMedia(config: DjiMediaModuleConfig = {}): void {
    this.requireLoaded("loadMedia", ["thing"]);
    this.loadComponent(
      "media",
      config as unknown as Record<string, unknown>
    );
  }

  loadMission(): void {
    this.requireLoaded("loadMission", ["thing", "ws", "api"]);
    this.loadComponent("mission", {});
  }

  getApiToken(): string | undefined {
    return asString(unwrap(runtime().apiGetToken(), "apiGetToken"));
  }

  setApiToken(token: string): void {
    unwrap(runtime().apiSetToken(token), "apiSetToken");
  }

  getApiHost(): string | undefined {
    return asString(unwrap(runtime().apiGetHost(), "apiGetHost"));
  }

  getThingConnectState(): boolean {
    return asBoolean(
      unwrap(runtime().thingGetConnectState(), "thingGetConnectState")
    );
  }

  connectThing(
    userName: string,
    password: string,
    callbackName: string
  ): void {
    unwrap(
      runtime().thingConnect(userName, password, callbackName),
      "thingConnect"
    );
  }

  disconnectThing(): void {
    unwrap(runtime().thingDisconnect(), "thingDisconnect");
  }

  setThingConnectCallback(callbackName: string): void {
    unwrap(
      runtime().thingSetConnectCallback(callbackName),
      "thingSetConnectCallback"
    );
  }

  getThingConfigs(): unknown {
    return unwrap(runtime().thingGetConfigs(), "thingGetConfigs");
  }

  getWsConnectState(): boolean {
    return asBoolean(unwrap(runtime().wsGetConnectState(), "wsGetConnectState"));
  }

  connectWs(host: string, token: string, callbackName: string): void {
    unwrap(
      runtime().wsConnect(host, token, callbackName),
      "wsConnect"
    );
  }

  disconnectWs(): void {
    unwrap(runtime().wsDisconnect(), "wsDisconnect");
  }

  sendWs(message: string): void {
    unwrap(runtime().wsSend(message), "wsSend");
  }

  setMapUserName(userName: string): void {
    unwrap(runtime().mapSetUserName(userName), "mapSetUserName");
  }

  setMapElementPrefix(prefix: string): void {
    unwrap(runtime().mapSetElementPreName(prefix), "mapSetElementPreName");
  }

  setMediaAutoUploadPhoto(auto: boolean): void {
    unwrap(
      runtime().mediaSetAutoUploadPhoto(auto),
      "mediaSetAutoUploadPhoto"
    );
  }

  getMediaAutoUploadPhoto(): boolean {
    return asBoolean(
      unwrap(runtime().mediaGetAutoUploadPhoto(), "mediaGetAutoUploadPhoto")
    );
  }

  setMediaUploadPhotoType(type: 0 | 1): void {
    unwrap(
      runtime().mediaSetUploadPhotoType(type),
      "mediaSetUploadPhotoType"
    );
  }

  getMediaUploadPhotoType(): number | undefined {
    const value = unwrap(
      runtime().mediaGetUploadPhotoType(),
      "mediaGetUploadPhotoType"
    );
    return typeof value === "number" ? value : undefined;
  }

  setMediaAutoUploadVideo(auto: boolean): void {
    unwrap(
      runtime().mediaSetAutoUploadVideo(auto),
      "mediaSetAutoUploadVideo"
    );
  }

  getMediaAutoUploadVideo(): boolean {
    return asBoolean(
      unwrap(runtime().mediaGetAutoUploadVideo(), "mediaGetAutoUploadVideo")
    );
  }

  setMediaDownloadOwner(owner: 0 | 1): void {
    unwrap(
      runtime().mediaSetDownloadOwner(owner),
      "mediaSetDownloadOwner"
    );
  }

  getMediaDownloadOwner(): number | undefined {
    const value = unwrap(
      runtime().mediaGetDownloadOwner(),
      "mediaGetDownloadOwner"
    );
    return typeof value === "number" ? value : undefined;
  }

  setLogEncryptKey(key: string): void {
    unwrap(
      runtime().platformSetLogEncryptKey(key),
      "platformSetLogEncryptKey"
    );
  }

  clearLogEncryptKey(): void {
    unwrap(
      runtime().platformClearLogEncryptKey(),
      "platformClearLogEncryptKey"
    );
  }

  getLogPath(): string | undefined {
    return asString(
      unwrap(runtime().platformGetLogPath(), "platformGetLogPath")
    );
  }

  setVideoPublishType(
    type:
      | "video-on-demand"
      | "video-by-manual"
      | "video-demand-aux-manual"
  ): void {
    const liveshare = window.liveshare;
    if (!liveshare?.setVideoPublishType) {
      throw new Error("DJI Pilot 2 liveshare Runtime ist nicht verfügbar");
    }
    unwrap(
      liveshare.setVideoPublishType(type),
      "liveshare.setVideoPublishType"
    );
  }

  /**
   * Configure Pilot 2 manual live streaming to the FH2-owned RTMP endpoint.
   * This is a low-level FC1-capable primitive; no UI path calls it directly.
   */
  configureRtmpLivestream(url: string): void {
    if (!/^rtmp:\/\//i.test(url)) {
      throw new Error("DJI JSBridge RTMP-Ziel muss mit rtmp:// beginnen");
    }
    unwrap(
      runtime().liveshareSetConfig(2, JSON.stringify({ url })),
      "liveshareSetConfig"
    );
  }

  startManualLivestream(): void {
    unwrap(runtime().liveshareStartLive(), "liveshareStartLive");
  }

  stopManualLivestream(): void {
    unwrap(runtime().liveshareStopLive(), "liveshareStopLive");
  }

  getLivestreamStatus(): unknown {
    return unwrap(runtime().liveshareGetStatus(), "liveshareGetStatus");
  }

  stopPlatform(): void {
    unwrap(runtime().platformStopSelf(), "platformStopSelf");
  }
}
