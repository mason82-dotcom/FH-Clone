import {
  readXmlDocument,
  type XmlElement,
  type XmlReaderLimits
} from "./xml-reader.js";

export const KML_NAMESPACE_URI = "http://www.opengis.net/kml/2.2";
export const DJI_WPML_NAMESPACE_URI = "http://www.dji.com/wpmz/1.0.2";

export type DjiWpmlFlyToWaylineMode = "safely" | "pointToPoint";
export type DjiWpmlFinishAction =
  | "goHome"
  | "noAction"
  | "autoLand"
  | "gotoFirstWaypoint";
export type DjiWpmlExitOnRcLost = "goContinue" | "executeLostAction";
export type DjiWpmlExecuteRcLostAction = "goBack" | "landing" | "hover";

export interface DjiWpmlTakeOffRefPoint {
  latitudeDeg: number;
  longitudeDeg: number;
  ellipsoidHeightM: number;
}

export interface DjiWpmlDroneInfo {
  enumValue: number;
  subEnumValue?: number;
}

export interface DjiWpmlPayloadInfo {
  enumValue: number;
  positionIndex: number;
}

export interface DjiWpmlMissionConfig {
  flyToWaylineMode: DjiWpmlFlyToWaylineMode;
  finishAction: DjiWpmlFinishAction;
  exitOnRcLost: DjiWpmlExitOnRcLost;
  executeRcLostAction?: DjiWpmlExecuteRcLostAction;
  takeOffSecurityHeightM: number;
  takeOffRefPoint?: DjiWpmlTakeOffRefPoint;
  takeOffRefPointAglHeightM?: number;
  globalTransitionalSpeedMps: number;
  droneInfo: DjiWpmlDroneInfo;
  payloadInfo: DjiWpmlPayloadInfo;
}

export interface DjiWpmlTemplateDocument {
  author?: string;
  createTimeMs?: number;
  updateTimeMs?: number;
  missionConfig: DjiWpmlMissionConfig;
}

export class DjiWpmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DjiWpmlParseError";
  }
}

function childElements(
  parent: XmlElement,
  namespaceUri: string,
  localName: string
): XmlElement[] {
  return parent.children.filter(
    (child) =>
      child.name.namespaceUri === namespaceUri &&
      child.name.localName === localName
  );
}

function singleChild(
  parent: XmlElement,
  namespaceUri: string,
  localName: string,
  required: boolean
): XmlElement | undefined {
  const matches = childElements(parent, namespaceUri, localName);
  if (matches.length > 1) {
    throw new DjiWpmlParseError(
      `Expected at most one {${namespaceUri}}${localName}, found ${matches.length}`
    );
  }
  if (required && matches.length === 0) {
    throw new DjiWpmlParseError(
      `Missing required {${namespaceUri}}${localName}`
    );
  }
  return matches[0];
}

function scalarText(element: XmlElement, field: string): string {
  if (element.children.length !== 0) {
    throw new DjiWpmlParseError(`${field} must contain scalar text only`);
  }
  const value = element.text.trim();
  if (value.length === 0) {
    throw new DjiWpmlParseError(`${field} may not be empty`);
  }
  return value;
}

function requiredText(
  parent: XmlElement,
  namespaceUri: string,
  localName: string
): string {
  return scalarText(
    singleChild(parent, namespaceUri, localName, true)!,
    localName
  );
}

function optionalText(
  parent: XmlElement,
  namespaceUri: string,
  localName: string
): string | undefined {
  const element = singleChild(parent, namespaceUri, localName, false);
  return element ? scalarText(element, localName) : undefined;
}

function parseInteger(value: string, field: string): number {
  if (!/^[+-]?\d+$/.test(value)) {
    throw new DjiWpmlParseError(`${field} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new DjiWpmlParseError(`${field} is outside the safe integer range`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string, field: string): number {
  const parsed = parseInteger(value, field);
  if (parsed < 0) {
    throw new DjiWpmlParseError(`${field} must be non-negative`);
  }
  return parsed;
}

function parseFiniteNumber(value: string, field: string): number {
  if (value.length === 0) {
    throw new DjiWpmlParseError(`${field} may not be empty`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new DjiWpmlParseError(`${field} must be a finite number`);
  }
  return parsed;
}

function parseEnum<T extends string>(
  value: string,
  field: string,
  allowed: readonly T[]
): T {
  if (!allowed.includes(value as T)) {
    throw new DjiWpmlParseError(
      `${field} has unsupported value "${value}"`
    );
  }
  return value as T;
}

function parseTakeOffRefPoint(value: string): DjiWpmlTakeOffRefPoint {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 3) {
    throw new DjiWpmlParseError(
      "takeOffRefPoint must contain latitude,longitude,altitude"
    );
  }

  const latitudeDeg = parseFiniteNumber(parts[0]!, "takeOffRefPoint latitude");
  const longitudeDeg = parseFiniteNumber(parts[1]!, "takeOffRefPoint longitude");
  const ellipsoidHeightM = parseFiniteNumber(parts[2]!, "takeOffRefPoint altitude");

  if (latitudeDeg < -90 || latitudeDeg > 90) {
    throw new DjiWpmlParseError("takeOffRefPoint latitude is outside [-90,90]");
  }
  if (longitudeDeg < -180 || longitudeDeg > 180) {
    throw new DjiWpmlParseError("takeOffRefPoint longitude is outside [-180,180]");
  }

  return { latitudeDeg, longitudeDeg, ellipsoidHeightM };
}

function parseDroneInfo(missionConfig: XmlElement): DjiWpmlDroneInfo {
  const element = singleChild(
    missionConfig,
    DJI_WPML_NAMESPACE_URI,
    "droneInfo",
    true
  )!;

  const enumValue = parseNonNegativeInteger(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "droneEnumValue"),
    "droneEnumValue"
  );
  const rawSubEnumValue = optionalText(
    element,
    DJI_WPML_NAMESPACE_URI,
    "droneSubEnumValue"
  );

  return {
    enumValue,
    ...(rawSubEnumValue !== undefined
      ? {
          subEnumValue: parseNonNegativeInteger(
            rawSubEnumValue,
            "droneSubEnumValue"
          )
        }
      : {})
  };
}

function parsePayloadInfo(missionConfig: XmlElement): DjiWpmlPayloadInfo {
  const element = singleChild(
    missionConfig,
    DJI_WPML_NAMESPACE_URI,
    "payloadInfo",
    true
  )!;

  const enumValue = parseNonNegativeInteger(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "payloadEnumValue"),
    "payloadEnumValue"
  );
  const positionIndex = parseNonNegativeInteger(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "payloadPositionIndex"),
    "payloadPositionIndex"
  );

  if (positionIndex > 2) {
    throw new DjiWpmlParseError(
      "payloadPositionIndex must be one of the DJI mounting positions 0, 1 or 2"
    );
  }

  return { enumValue, positionIndex };
}

function parseMissionConfig(documentElement: XmlElement): DjiWpmlMissionConfig {
  const element = singleChild(
    documentElement,
    DJI_WPML_NAMESPACE_URI,
    "missionConfig",
    true
  )!;

  const flyToWaylineMode = parseEnum(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "flyToWaylineMode"),
    "flyToWaylineMode",
    ["safely", "pointToPoint"] as const
  );
  const finishAction = parseEnum(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "finishAction"),
    "finishAction",
    ["goHome", "noAction", "autoLand", "gotoFirstWaypoint"] as const
  );
  const exitOnRcLost = parseEnum(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "exitOnRCLost"),
    "exitOnRCLost",
    ["goContinue", "executeLostAction"] as const
  );

  const rawExecuteRcLostAction = optionalText(
    element,
    DJI_WPML_NAMESPACE_URI,
    "executeRCLostAction"
  );
  if (exitOnRcLost === "executeLostAction" && rawExecuteRcLostAction === undefined) {
    throw new DjiWpmlParseError(
      "executeRCLostAction is required when exitOnRCLost=executeLostAction"
    );
  }

  const executeRcLostAction =
    rawExecuteRcLostAction === undefined
      ? undefined
      : parseEnum(
          rawExecuteRcLostAction,
          "executeRCLostAction",
          ["goBack", "landing", "hover"] as const
        );

  const takeOffSecurityHeightM = parseFiniteNumber(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "takeOffSecurityHeight"),
    "takeOffSecurityHeight"
  );
  if (takeOffSecurityHeightM < 1.2 || takeOffSecurityHeightM > 1500) {
    throw new DjiWpmlParseError(
      "takeOffSecurityHeight is outside DJI's documented [1.2,1500] m range"
    );
  }

  const globalTransitionalSpeedMps = parseFiniteNumber(
    requiredText(element, DJI_WPML_NAMESPACE_URI, "globalTransitionalSpeed"),
    "globalTransitionalSpeed"
  );
  if (globalTransitionalSpeedMps <= 0) {
    throw new DjiWpmlParseError("globalTransitionalSpeed must be greater than 0");
  }

  const rawTakeOffRefPoint = optionalText(
    element,
    DJI_WPML_NAMESPACE_URI,
    "takeOffRefPoint"
  );
  const rawTakeOffRefPointAglHeight = optionalText(
    element,
    DJI_WPML_NAMESPACE_URI,
    "takeOffRefPointAGLHeight"
  );

  return {
    flyToWaylineMode,
    finishAction,
    exitOnRcLost,
    ...(executeRcLostAction !== undefined ? { executeRcLostAction } : {}),
    takeOffSecurityHeightM,
    ...(rawTakeOffRefPoint !== undefined
      ? { takeOffRefPoint: parseTakeOffRefPoint(rawTakeOffRefPoint) }
      : {}),
    ...(rawTakeOffRefPointAglHeight !== undefined
      ? {
          takeOffRefPointAglHeightM: parseFiniteNumber(
            rawTakeOffRefPointAglHeight,
            "takeOffRefPointAGLHeight"
          )
        }
      : {}),
    globalTransitionalSpeedMps,
    droneInfo: parseDroneInfo(element),
    payloadInfo: parsePayloadInfo(element)
  };
}

export function parseDjiWpmlTemplateKml(
  xml: string,
  limits: Partial<XmlReaderLimits> = {}
): DjiWpmlTemplateDocument {
  const parsed = readXmlDocument(xml, limits);
  const root = parsed.root;

  if (
    root.name.namespaceUri !== KML_NAMESPACE_URI ||
    root.name.localName !== "kml"
  ) {
    throw new DjiWpmlParseError(
      `Expected KML 2.2 root element, received {${root.name.namespaceUri ?? ""}}${root.name.localName}`
    );
  }

  const documentElement = singleChild(
    root,
    KML_NAMESPACE_URI,
    "Document",
    true
  )!;

  const author = optionalText(
    documentElement,
    DJI_WPML_NAMESPACE_URI,
    "author"
  );
  const rawCreateTime = optionalText(
    documentElement,
    DJI_WPML_NAMESPACE_URI,
    "createTime"
  );
  const rawUpdateTime = optionalText(
    documentElement,
    DJI_WPML_NAMESPACE_URI,
    "updateTime"
  );

  return {
    ...(author !== undefined ? { author } : {}),
    ...(rawCreateTime !== undefined
      ? { createTimeMs: parseNonNegativeInteger(rawCreateTime, "createTime") }
      : {}),
    ...(rawUpdateTime !== undefined
      ? { updateTimeMs: parseNonNegativeInteger(rawUpdateTime, "updateTime") }
      : {}),
    missionConfig: parseMissionConfig(documentElement)
  };
}
