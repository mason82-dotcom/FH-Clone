export interface WpmlValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface WpmlDroneInfo {
  enumValue: number;
  subEnumValue?: number;
  model?: string;
}

export interface WpmlPayloadInfo {
  enumValue: number;
  positionIndex: number;
  model?: string;
}

export interface WpmlMissionConfig {
  rawXml: string;
  flyToWaylineMode?: string;
  finishAction?: string;
  exitOnRCLost?: string;
  executeRCLostAction?: string;
  takeOffSecurityHeightM?: number;
  takeOffRefPoint?: string;
  takeOffRefPointAglHeightM?: number;
  globalTransitionalSpeedMps?: number;
  /** Required by DJI in waylines.wpml; kept read-only and never implies RTH authority. */
  globalRthHeightM?: number;
  drone?: WpmlDroneInfo;
  payload?: WpmlPayloadInfo;
}

export interface WpmlAction {
  rawXml: string;
  id: number;
  actuator: string;
  params: Record<string, string>;
}

export interface WpmlActionGroup {
  rawXml: string;
  id: number;
  startIndex: number;
  endIndex: number;
  mode: string;
  triggerType: string;
  triggerParam?: number;
  actions: WpmlAction[];
}

export interface WpmlWaypoint {
  rawXml: string;
  index: number;
  longitude: number;
  latitude: number;
  executeHeightM?: number;
  templateHeightM?: number;
  ellipsoidHeightM?: number;
  speedMps?: number;
  useGlobalSpeed?: boolean;
  gimbalPitchDeg?: number;
  actionGroups: WpmlActionGroup[];
}

export interface WpmlTemplateFolder {
  rawXml: string;
  templateType: string;
  templateId: number;
  autoFlightSpeedMps?: number;
  coordinateMode?: string;
  heightMode?: string;
  positioningType?: string;
  waypoints: WpmlWaypoint[];
}

export interface WpmlWaylineFolder {
  rawXml: string;
  templateId: number;
  waylineId: number;
  executeHeightMode: string;
  autoFlightSpeedMps?: number;
  /** Optional DJI initial actions executed before the wayline begins. */
  startActionGroups: WpmlActionGroup[];
  waypoints: WpmlWaypoint[];
}

export interface WpmlTemplateDocument {
  kind: "template";
  rawXml: string;
  namespace?: string;
  author?: string;
  createTimeMs?: number;
  updateTimeMs?: number;
  missionConfig: WpmlMissionConfig;
  folders: WpmlTemplateFolder[];
  issues: WpmlValidationIssue[];
}

export interface WpmlWaylinesDocument {
  kind: "waylines";
  rawXml: string;
  namespace?: string;
  missionConfig: WpmlMissionConfig;
  folders: WpmlWaylineFolder[];
  issues: WpmlValidationIssue[];
}

export interface WpmlBundle {
  template: WpmlTemplateDocument;
  waylines: WpmlWaylinesDocument;
  issues: WpmlValidationIssue[];
}

export interface WpmlKmzEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
}

export interface WpmlKmzPackage {
  entries: WpmlKmzEntry[];
  resources: string[];
  templateXml: string;
  waylinesXml: string;
  bundle: WpmlBundle;
}

export interface DjiPilotWaylineStartPoint {
  latitude: number;
  longitude: number;
}

export interface DjiPilotWaylineItem {
  id?: string;
  name?: string;
  droneModelKey?: string;
  payloadModelKeys: string[];
  templateTypes: number[];
  actionType?: number;
  favorited?: boolean;
  updateTimeMs?: number;
  userName?: string;
  startPoint?: DjiPilotWaylineStartPoint;
}

export interface DjiPilotWaylinePage {
  items: DjiPilotWaylineItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface DjiPilotWaylineListQuery {
  /** Optional wayline file-name search used by DJI Pilot 2. */
  key?: string;
  favorited?: boolean;
  orderBy?: string;
  page?: number;
  pageSize?: number;
  templateTypes?: number[];
  actionType?: number;
  droneModelKeys?: string[];
  payloadModelKeys?: string[];
}
