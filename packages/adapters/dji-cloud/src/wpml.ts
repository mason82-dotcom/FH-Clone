import type { MissionExternalReference } from "@fh-clone/aircraft-core";

const MAX_XML_BYTES = 2_000_000;
const MAX_XML_DEPTH = 64;
const MAX_XML_NODES = 20_000;

interface XmlNode {
  name: string;
  text: string[];
  children: XmlNode[];
}

export class DjiWpmlImportError extends Error {}

export interface DjiWpmlProductInfo {
  enumValue: number;
  subEnumValue?: number;
}

export interface DjiWpmlPayloadInfo {
  enumValue: number;
  positionIndex: number;
}

export interface DjiWpmlTakeoffReference {
  latitudeDeg: number;
  longitudeDeg: number;
  ellipsoidHeightM: number;
}

export interface DjiWpmlMissionConfig {
  flyToWaylineMode: string;
  finishAction: string;
  exitOnRCLost: string;
  executeRCLostAction?: string;
  takeOffSecurityHeightM: number;
  takeOffRefPoint?: DjiWpmlTakeoffReference;
  takeOffRefPointAglHeightM?: number;
  globalTransitionalSpeedMps: number;
  drone: DjiWpmlProductInfo;
  payload: DjiWpmlPayloadInfo;
}

export interface DjiWpmlCoordinateSystem {
  coordinateMode?: string;
  heightMode?: string;
  globalShootHeightM?: number;
  positioningType?: string;
  surfaceFollowModeEnabled?: boolean;
  surfaceRelativeHeightM?: number;
}

export interface DjiWpmlHeadingParam {
  mode?: string;
  angleDeg?: number;
  poiPoint?: string;
  pathMode?: string;
}

export interface DjiWpmlAction {
  id: number;
  actuatorFunc: string;
  params: Record<string, string | string[]>;
}

export interface DjiWpmlActionGroup {
  id: number;
  startIndex: number;
  endIndex: number;
  mode: string;
  triggerType: string;
  actions: DjiWpmlAction[];
}

export interface DjiWpmlWaypoint {
  index: number;
  longitudeDeg: number;
  latitudeDeg: number;
  kmlAltitudeM?: number;
  ellipsoidHeightM?: number;
  heightM?: number;
  useGlobalHeight?: boolean;
  useGlobalSpeed?: boolean;
  useGlobalHeadingParam?: boolean;
  useGlobalTurnParam?: boolean;
  waypointSpeedMps?: number;
  gimbalPitchAngleDeg?: number;
  heading?: DjiWpmlHeadingParam;
  actionGroups: DjiWpmlActionGroup[];
}

export interface DjiWpmlPayloadParam {
  positionIndex: number;
  imageFormats: string[];
  values: Record<string, string | string[]>;
}

export interface DjiWpmlTemplate {
  type: string;
  id: number;
  autoFlightSpeedMps: number;
  coordinateSystem: DjiWpmlCoordinateSystem;
  payloadParams: DjiWpmlPayloadParam[];
  globalHeading?: DjiWpmlHeadingParam;
  globalWaypointTurnMode?: string;
  globalUseStraightLine?: boolean;
  waypoints: DjiWpmlWaypoint[];
}

export interface DjiWpmlTemplateImport {
  format: "template.kml";
  wpmlNamespace: string;
  author?: string;
  createTimeMs?: number;
  updateTimeMs?: number;
  missionConfig: DjiWpmlMissionConfig;
  templates: DjiWpmlTemplate[];
  warnings: string[];
  /**
   * Raw XML is retained so unknown/new DJI elements are never silently lost.
   * Persistence layers may choose to store it separately from normalized fields.
   */
  sourceXml: string;
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function decodeXml(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g,
    (_match, entity: string) => {
      if (entity === "amp") return "&";
      if (entity === "lt") return "<";
      if (entity === "gt") return ">";
      if (entity === "quot") return "\"";
      if (entity === "apos") return "'";
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
  );
}

function parseXml(xml: string): XmlNode {
  if (Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES) {
    throw new DjiWpmlImportError("WPML XML exceeds the 2 MB import limit");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new DjiWpmlImportError("WPML XML must not contain DTD or ENTITY declarations");
  }

  const root: XmlNode = { name: "#document", text: [], children: [] };
  const stack: XmlNode[] = [root];
  let nodeCount = 0;
  const tokenPattern =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g;

  for (const match of xml.matchAll(tokenPattern)) {
    const token = match[0] ?? "";
    if (!token) continue;
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;

    if (token.startsWith("<![CDATA[")) {
      stack.at(-1)?.text.push(token.slice(9, -3));
      continue;
    }

    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim().split(/\s+/)[0] ?? "";
      if (stack.length <= 1) {
        throw new DjiWpmlImportError("Unexpected XML closing tag");
      }
      const current = stack.pop()!;
      if (current.name !== closingName) {
        throw new DjiWpmlImportError(
          "Mismatched XML closing tag: expected " + current.name + ", got " + closingName
        );
      }
      continue;
    }

    if (token.startsWith("<")) {
      if (token.startsWith("<!")) {
        throw new DjiWpmlImportError("Unsupported XML declaration");
      }
      const selfClosing = /\/\s*>$/.test(token);
      const inner = token.slice(1, selfClosing ? -2 : -1).trim();
      const name = inner.split(/\s+/)[0] ?? "";
      if (!name) throw new DjiWpmlImportError("Invalid XML element");

      nodeCount += 1;
      if (nodeCount > MAX_XML_NODES) {
        throw new DjiWpmlImportError("WPML XML contains too many elements");
      }
      if (stack.length > MAX_XML_DEPTH) {
        throw new DjiWpmlImportError("WPML XML nesting is too deep");
      }

      const node: XmlNode = { name, text: [], children: [] };
      stack.at(-1)!.children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }

    stack.at(-1)?.text.push(token);
  }

  if (stack.length !== 1) {
    throw new DjiWpmlImportError("Unclosed XML element");
  }
  return root;
}

function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((candidate) => localName(candidate.name) === name);
}

function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((candidate) => localName(candidate.name) === name);
}

function nodeText(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const value = decodeXml(node.text.join("")).trim();
  return value || undefined;
}

function optionalText(node: XmlNode, name: string): string | undefined {
  return nodeText(child(node, name));
}

function requiredText(node: XmlNode, name: string): string {
  const value = optionalText(node, name);
  if (value === undefined) {
    throw new DjiWpmlImportError("Missing required WPML element: " + name);
  }
  return value;
}

function parseNumberValue(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new DjiWpmlImportError("Invalid numeric WPML value for " + field);
  }
  return parsed;
}

function optionalNumber(node: XmlNode, name: string): number | undefined {
  const value = optionalText(node, name);
  return value === undefined ? undefined : parseNumberValue(value, name);
}

function requiredNumber(node: XmlNode, name: string): number {
  return parseNumberValue(requiredText(node, name), name);
}

function requiredInteger(node: XmlNode, name: string): number {
  const value = requiredNumber(node, name);
  if (!Number.isInteger(value)) {
    throw new DjiWpmlImportError("WPML element must be an integer: " + name);
  }
  return value;
}

function optionalBoolean01(node: XmlNode, name: string): boolean | undefined {
  const value = optionalText(node, name);
  if (value === undefined) return undefined;
  if (value === "0") return false;
  if (value === "1") return true;
  throw new DjiWpmlImportError("WPML boolean must be 0 or 1: " + name);
}

function validateLatitude(value: number, field: string): number {
  if (value < -90 || value > 90) {
    throw new DjiWpmlImportError(field + " latitude is out of range");
  }
  return value;
}

function validateLongitude(value: number, field: string): number {
  if (value < -180 || value > 180) {
    throw new DjiWpmlImportError(field + " longitude is out of range");
  }
  return value;
}

function parseTakeoffRefPoint(value: string): DjiWpmlTakeoffReference {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length < 3) {
    throw new DjiWpmlImportError("takeOffRefPoint must contain latitude,longitude,altitude");
  }

  const latitudeDeg = validateLatitude(
    parseNumberValue(parts[0]!, "takeOffRefPoint.latitude"),
    "takeOffRefPoint"
  );
  const longitudeDeg = validateLongitude(
    parseNumberValue(parts[1]!, "takeOffRefPoint.longitude"),
    "takeOffRefPoint"
  );
  const ellipsoidHeightM = parseNumberValue(parts[2]!, "takeOffRefPoint.altitude");

  return { latitudeDeg, longitudeDeg, ellipsoidHeightM };
}

function parsePoint(node: XmlNode): {
  longitudeDeg: number;
  latitudeDeg: number;
  kmlAltitudeM?: number;
} {
  const point = child(node, "Point");
  if (!point) throw new DjiWpmlImportError("Waypoint Placemark is missing Point");
  const raw = requiredText(point, "coordinates");
  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length < 2) {
    throw new DjiWpmlImportError("KML Point coordinates must contain longitude,latitude");
  }

  const longitudeDeg = validateLongitude(
    parseNumberValue(parts[0]!, "Point.longitude"),
    "Point"
  );
  const latitudeDeg = validateLatitude(
    parseNumberValue(parts[1]!, "Point.latitude"),
    "Point"
  );
  const altitude =
    parts[2] === undefined || parts[2] === ""
      ? undefined
      : parseNumberValue(parts[2], "Point.altitude");

  return {
    longitudeDeg,
    latitudeDeg,
    ...(altitude !== undefined ? { kmlAltitudeM: altitude } : {})
  };
}

function parseHeading(node: XmlNode | undefined): DjiWpmlHeadingParam | undefined {
  if (!node) return undefined;
  const heading: DjiWpmlHeadingParam = {
    ...(optionalText(node, "waypointHeadingMode")
      ? { mode: optionalText(node, "waypointHeadingMode") }
      : {}),
    ...(optionalNumber(node, "waypointHeadingAngle") !== undefined
      ? { angleDeg: optionalNumber(node, "waypointHeadingAngle") }
      : {}),
    ...(optionalText(node, "waypointPoiPoint")
      ? { poiPoint: optionalText(node, "waypointPoiPoint") }
      : {}),
    ...(optionalText(node, "waypointHeadingPathMode")
      ? { pathMode: optionalText(node, "waypointHeadingPathMode") }
      : {})
  };
  return Object.keys(heading).length > 0 ? heading : undefined;
}

function appendValue(
  output: Record<string, string | string[]>,
  key: string,
  value: string
): void {
  const current = output[key];
  if (current === undefined) {
    output[key] = value;
  } else if (Array.isArray(current)) {
    current.push(value);
  } else {
    output[key] = [current, value];
  }
}

function flattenLeafValues(
  node: XmlNode,
  output: Record<string, string | string[]>,
  prefix = ""
): void {
  for (const current of node.children) {
    const key = prefix
      ? prefix + "." + localName(current.name)
      : localName(current.name);
    if (current.children.length > 0) {
      flattenLeafValues(current, output, key);
    } else {
      const value = nodeText(current);
      if (value !== undefined) appendValue(output, key, value);
    }
  }
}

function parseAction(node: XmlNode): DjiWpmlAction {
  const paramsNode = child(node, "actionActuatorFuncParam");
  const params: Record<string, string | string[]> = {};
  if (paramsNode) flattenLeafValues(paramsNode, params);

  return {
    id: requiredInteger(node, "actionId"),
    actuatorFunc: requiredText(node, "actionActuatorFunc"),
    params
  };
}

function parseActionGroup(node: XmlNode): DjiWpmlActionGroup {
  const trigger = child(node, "actionTrigger");
  if (!trigger) {
    throw new DjiWpmlImportError("actionGroup is missing actionTrigger");
  }
  return {
    id: requiredInteger(node, "actionGroupId"),
    startIndex: requiredInteger(node, "actionGroupStartIndex"),
    endIndex: requiredInteger(node, "actionGroupEndIndex"),
    mode: requiredText(node, "actionGroupMode"),
    triggerType: requiredText(trigger, "actionTriggerType"),
    actions: children(node, "action").map(parseAction)
  };
}

function parseWaypoint(node: XmlNode): DjiWpmlWaypoint {
  const point = parsePoint(node);
  return {
    index: requiredInteger(node, "index"),
    ...point,
    ...(optionalNumber(node, "ellipsoidHeight") !== undefined
      ? { ellipsoidHeightM: optionalNumber(node, "ellipsoidHeight") }
      : {}),
    ...(optionalNumber(node, "height") !== undefined
      ? { heightM: optionalNumber(node, "height") }
      : {}),
    ...(optionalBoolean01(node, "useGlobalHeight") !== undefined
      ? { useGlobalHeight: optionalBoolean01(node, "useGlobalHeight") }
      : {}),
    ...(optionalBoolean01(node, "useGlobalSpeed") !== undefined
      ? { useGlobalSpeed: optionalBoolean01(node, "useGlobalSpeed") }
      : {}),
    ...(optionalBoolean01(node, "useGlobalHeadingParam") !== undefined
      ? { useGlobalHeadingParam: optionalBoolean01(node, "useGlobalHeadingParam") }
      : {}),
    ...(optionalBoolean01(node, "useGlobalTurnParam") !== undefined
      ? { useGlobalTurnParam: optionalBoolean01(node, "useGlobalTurnParam") }
      : {}),
    ...(optionalNumber(node, "waypointSpeed") !== undefined
      ? { waypointSpeedMps: optionalNumber(node, "waypointSpeed") }
      : {}),
    ...(optionalNumber(node, "gimbalPitchAngle") !== undefined
      ? { gimbalPitchAngleDeg: optionalNumber(node, "gimbalPitchAngle") }
      : {}),
    ...(parseHeading(child(node, "waypointHeadingParam"))
      ? { heading: parseHeading(child(node, "waypointHeadingParam")) }
      : {}),
    actionGroups: children(node, "actionGroup").map(parseActionGroup)
  };
}

function parsePayloadParam(node: XmlNode): DjiWpmlPayloadParam {
  const values: Record<string, string | string[]> = {};
  flattenLeafValues(node, values);
  const formats = optionalText(node, "imageFormat");

  return {
    positionIndex: requiredInteger(node, "payloadPositionIndex"),
    imageFormats: formats
      ? formats.split(",").map((value) => value.trim()).filter(Boolean)
      : [],
    values
  };
}

function parseTemplate(folder: XmlNode): DjiWpmlTemplate {
  const coordinateNode = child(folder, "waylineCoordinateSysParam");
  const coordinateSystem: DjiWpmlCoordinateSystem = coordinateNode
    ? {
        ...(optionalText(coordinateNode, "coordinateMode")
          ? { coordinateMode: optionalText(coordinateNode, "coordinateMode") }
          : {}),
        ...(optionalText(coordinateNode, "heightMode")
          ? { heightMode: optionalText(coordinateNode, "heightMode") }
          : {}),
        ...(optionalNumber(coordinateNode, "globalShootHeight") !== undefined
          ? { globalShootHeightM: optionalNumber(coordinateNode, "globalShootHeight") }
          : {}),
        ...(optionalText(coordinateNode, "positioningType")
          ? { positioningType: optionalText(coordinateNode, "positioningType") }
          : {}),
        ...(optionalBoolean01(coordinateNode, "surfaceFollowModeEnable") !== undefined
          ? {
              surfaceFollowModeEnabled: optionalBoolean01(
                coordinateNode,
                "surfaceFollowModeEnable"
              )
            }
          : {}),
        ...(optionalNumber(coordinateNode, "surfaceRelativeHeight") !== undefined
          ? {
              surfaceRelativeHeightM: optionalNumber(
                coordinateNode,
                "surfaceRelativeHeight"
              )
            }
          : {})
      }
    : {};

  return {
    type: requiredText(folder, "templateType"),
    id: requiredInteger(folder, "templateId"),
    autoFlightSpeedMps: requiredNumber(folder, "autoFlightSpeed"),
    coordinateSystem,
    payloadParams: children(folder, "payloadParam").map(parsePayloadParam),
    ...(parseHeading(child(folder, "globalWaypointHeadingParam"))
      ? { globalHeading: parseHeading(child(folder, "globalWaypointHeadingParam")) }
      : {}),
    ...(optionalText(folder, "globalWaypointTurnMode")
      ? { globalWaypointTurnMode: optionalText(folder, "globalWaypointTurnMode") }
      : {}),
    ...(optionalBoolean01(folder, "globalUseStraightLine") !== undefined
      ? { globalUseStraightLine: optionalBoolean01(folder, "globalUseStraightLine") }
      : {}),
    waypoints: children(folder, "Placemark").map(parseWaypoint)
  };
}

function readWpmlNamespace(xml: string): string {
  const match = xml.match(/\bxmlns:wpml\s*=\s*["']([^"']+)["']/i);
  const namespace = match?.[1]?.trim();
  if (!namespace || !namespace.startsWith("http://www.dji.com/wpmz/")) {
    throw new DjiWpmlImportError("Missing or unsupported DJI WPML namespace");
  }
  return namespace;
}

export function parseDjiWpmlTemplateKml(xml: string): DjiWpmlTemplateImport {
  const sourceXml = xml.trim();
  if (!sourceXml) throw new DjiWpmlImportError("WPML XML is empty");

  const wpmlNamespace = readWpmlNamespace(sourceXml);
  const parsed = parseXml(sourceXml);
  const kml = parsed.children.find((node) => localName(node.name) === "kml");
  if (!kml) throw new DjiWpmlImportError("WPML document is missing kml root");
  const document = child(kml, "Document");
  if (!document) throw new DjiWpmlImportError("WPML document is missing Document");

  const missionNode = child(document, "missionConfig");
  if (!missionNode) throw new DjiWpmlImportError("WPML document is missing missionConfig");

  const droneNode = child(missionNode, "droneInfo");
  if (!droneNode) throw new DjiWpmlImportError("missionConfig is missing droneInfo");
  const payloadNode = child(missionNode, "payloadInfo");
  if (!payloadNode) throw new DjiWpmlImportError("missionConfig is missing payloadInfo");

  const exitOnRCLost = requiredText(missionNode, "exitOnRCLost");
  const executeRCLostAction = optionalText(missionNode, "executeRCLostAction");
  if (exitOnRCLost === "executeLostAction" && !executeRCLostAction) {
    throw new DjiWpmlImportError(
      "executeRCLostAction is required when exitOnRCLost=executeLostAction"
    );
  }

  const takeOffRefPointText = optionalText(missionNode, "takeOffRefPoint");
  const missionConfig: DjiWpmlMissionConfig = {
    flyToWaylineMode: requiredText(missionNode, "flyToWaylineMode"),
    finishAction: requiredText(missionNode, "finishAction"),
    exitOnRCLost,
    ...(executeRCLostAction ? { executeRCLostAction } : {}),
    takeOffSecurityHeightM: requiredNumber(missionNode, "takeOffSecurityHeight"),
    ...(takeOffRefPointText
      ? { takeOffRefPoint: parseTakeoffRefPoint(takeOffRefPointText) }
      : {}),
    ...(optionalNumber(missionNode, "takeOffRefPointAGLHeight") !== undefined
      ? {
          takeOffRefPointAglHeightM: optionalNumber(
            missionNode,
            "takeOffRefPointAGLHeight"
          )
        }
      : {}),
    globalTransitionalSpeedMps: requiredNumber(
      missionNode,
      "globalTransitionalSpeed"
    ),
    drone: {
      enumValue: requiredInteger(droneNode, "droneEnumValue"),
      ...(optionalNumber(droneNode, "droneSubEnumValue") !== undefined
        ? { subEnumValue: requiredInteger(droneNode, "droneSubEnumValue") }
        : {})
    },
    payload: {
      enumValue: requiredInteger(payloadNode, "payloadEnumValue"),
      positionIndex: requiredInteger(payloadNode, "payloadPositionIndex")
    }
  };

  const templates = children(document, "Folder").map(parseTemplate);
  if (templates.length === 0) {
    throw new DjiWpmlImportError("WPML document contains no template Folder");
  }

  const seenIds = new Set<number>();
  for (const template of templates) {
    if (seenIds.has(template.id)) {
      throw new DjiWpmlImportError(
        "WPML templateId must be unique within the document: " + template.id
      );
    }
    seenIds.add(template.id);
  }

  const warnings: string[] = [];
  for (const template of templates) {
    if (template.type !== "waypoint") {
      warnings.push(
        "Template " +
          template.id +
          " uses type " +
          template.type +
          "; common fields are imported but type-specific geometry is not normalized yet"
      );
    }
  }

  return {
    format: "template.kml",
    wpmlNamespace,
    ...(optionalText(document, "author")
      ? { author: optionalText(document, "author") }
      : {}),
    ...(optionalNumber(document, "createTime") !== undefined
      ? { createTimeMs: optionalNumber(document, "createTime") }
      : {}),
    ...(optionalNumber(document, "updateTime") !== undefined
      ? { updateTimeMs: optionalNumber(document, "updateTime") }
      : {}),
    missionConfig,
    templates,
    warnings,
    sourceXml
  };
}

/**
 * Builds an explicit WPML external reference only when the caller has a
 * stable KMZ/object identifier. A templateId alone is not globally unique.
 */
export function createDjiWpmlMissionReference(
  stableDocumentId: string
): MissionExternalReference {
  const id = stableDocumentId.trim();
  if (!id) {
    throw new DjiWpmlImportError("Stable WPML document id is required");
  }
  return {
    kind: "wayline",
    id,
    source: "dji_wpml",
    confidence: "authoritative"
  };
}
