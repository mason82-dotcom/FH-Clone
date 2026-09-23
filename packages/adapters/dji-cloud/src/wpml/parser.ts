import {
  type WpmlAction,
  type WpmlActionGroup,
  type WpmlAutoRerouteInfo,
  type WpmlBundle,
  type WpmlDroneInfo,
  type WpmlMissionConfig,
  type WpmlPayloadInfo,
  type WpmlTemplateDocument,
  type WpmlTemplateFolder,
  type WpmlTemplatePayloadParam,
  type WpmlValidationIssue,
  type WpmlWaypoint,
  type WpmlWaylineFolder,
  type WpmlWaylinesDocument
} from "./types.js";
import {
  assertSafeXml,
  parseCoordinates,
  simpleChildMap,
  xmlBlocks,
  xmlNamespace,
  xmlNumber,
  xmlText
} from "./xml.js";

export const DJI_WPML_NAMESPACE = "http://www.dji.com/wpmz/1.0.2";

const DRONE_MODELS: Readonly<Record<string, string>> = {
  "60:*": "DJI Matrice 300 RTK",
  "89:*": "DJI Matrice 350 RTK",
  "67:0": "DJI Matrice 30",
  "67:1": "DJI Matrice 30T",
  "77:0": "DJI Mavic 3 Enterprise",
  "77:1": "DJI Mavic 3 Thermal",
  "77:2": "DJI Mavic 3 Multispectral",
  "91:0": "DJI Matrice 3D",
  "91:1": "DJI Matrice 3TD",
  "99:0": "DJI Matrice 4E",
  "99:1": "DJI Matrice 4T",
  "100:0": "DJI Matrice 4D",
  "100:1": "DJI Matrice 4TD"
};

const KNOWN_TEMPLATE_TYPES = new Set(["waypoint", "mapping2d", "mapping3d", "mappingStrip"]);
const KNOWN_FLY_TO_MODES = new Set(["safely", "pointToPoint"]);
const KNOWN_FINISH_ACTIONS = new Set(["goHome", "noAction", "autoLand", "gotoFirstWaypoint"]);
const KNOWN_RC_LOST_MODES = new Set(["goContinue", "executeLostAction"]);
const KNOWN_RC_LOST_ACTIONS = new Set(["goBack", "landing", "hover"]);
const KNOWN_EXECUTE_HEIGHT_MODES = new Set(["WGS84", "relativeToStartPoint", "realTimeFollowSurface"]);
const KNOWN_TRIGGER_TYPES = new Set([
  "reachPoint",
  "betweenAdjacentPoints",
  "multipleTiming",
  "multipleDistance"
]);
const KNOWN_ACTIONS = new Set([
  "takePhoto",
  "startRecord",
  "stopRecord",
  "focus",
  "zoom",
  "customDirName",
  "gimbalRotate",
  "rotateYaw",
  "hover",
  "gimbalEvenlyRotate",
  "accurateShoot",
  "orientedShoot",
  "panoShot",
  "recordPointCloud"
]);

const PAYLOAD_MODELS: Readonly<Record<number, string>> = {
  42: "DJI Zenmuse H20",
  43: "DJI Zenmuse H20T",
  52: "DJI Matrice 30 Camera",
  53: "DJI Matrice 30T Camera",
  61: "DJI Zenmuse H20N",
  66: "DJI Mavic 3E Camera",
  67: "DJI Mavic 3T Camera",
  68: "DJI Mavic 3M Camera",
  80: "DJI Matrice 3D Camera",
  81: "DJI Matrice 3TD Camera",
  82: "DJI Zenmuse H30",
  83: "DJI Zenmuse H30T",
  88: "DJI Matrice 4E Camera",
  89: "DJI Matrice 4T Camera",
  98: "DJI Matrice 4D Camera",
  99: "DJI Matrice 4TD Camera",
  65534: "DJI PSDK Payload"
};

export function parseWpmlTemplate(xml: string): WpmlTemplateDocument {
  assertSafeXml(xml);
  const issues: WpmlValidationIssue[] = [];
  const namespace = xmlNamespace(xml);
  validateNamespace(namespace, issues);

  const missionXml = xmlBlocks(xml, "missionConfig")[0] ?? "";
  if (!missionXml) {
    issues.push(error("template.mission_config_missing", "template.kml requires wpml:missionConfig"));
  }

  const missionConfig = parseMissionConfig(missionXml);
  validateMissionConfig(missionConfig, issues, "missionConfig", "template");

  const folders = xmlBlocks(xml, "Folder").map(parseTemplateFolder);
  if (folders.length === 0) {
    issues.push(error("template.folder_missing", "template.kml requires at least one Folder"));
  }

  const templateIds = new Set<number>();
  const actionGroupIds = new Set<number>();
  for (const [index, folder] of folders.entries()) {
    const path = `folders[${index}]`;
    if (!folder.templateType) {
      issues.push(error("template.type_missing", "Folder requires wpml:templateType", path));
    }
    if (!Number.isInteger(folder.templateId) || folder.templateId < 0 || folder.templateId > 65_535) {
      issues.push(error("template.id_invalid", "wpml:templateId must be in [0,65535]", path));
    } else if (templateIds.has(folder.templateId)) {
      issues.push(error("template.id_duplicate", "wpml:templateId must be unique in template.kml", path));
    }
    templateIds.add(folder.templateId);
    if (folder.templateType && !KNOWN_TEMPLATE_TYPES.has(folder.templateType)) {
      issues.push(warning("template.type_unknown", `Unknown templateType: ${folder.templateType}`, path));
    }
    if (folder.autoFlightSpeedMps === undefined) {
      issues.push(error("template.speed_missing", "wpml:autoFlightSpeed is required", path));
    } else if (folder.autoFlightSpeedMps <= 0) {
      issues.push(error("template.speed_invalid", "autoFlightSpeed must be > 0", path));
    }
    validateWaypoints(folder.waypoints, issues, path, actionGroupIds, false);
  }

  const author = xmlText(xml, "author");
  const createTimeMs = xmlNumber(xml, "createTime");
  const updateTimeMs = xmlNumber(xml, "updateTime");

  return {
    kind: "template",
    rawXml: xml,
    ...(namespace ? { namespace } : {}),
    ...(author ? { author } : {}),
    ...(createTimeMs !== undefined ? { createTimeMs } : {}),
    ...(updateTimeMs !== undefined ? { updateTimeMs } : {}),
    missionConfig,
    folders,
    issues
  };
}

export function parseWpmlWaylines(xml: string): WpmlWaylinesDocument {
  assertSafeXml(xml);
  const issues: WpmlValidationIssue[] = [];
  const namespace = xmlNamespace(xml);
  validateNamespace(namespace, issues);

  const missionXml = xmlBlocks(xml, "missionConfig")[0] ?? "";
  if (!missionXml) {
    issues.push(error("waylines.mission_config_missing", "waylines.wpml requires wpml:missionConfig"));
  }

  const missionConfig = parseMissionConfig(missionXml);
  validateMissionConfig(missionConfig, issues, "missionConfig", "waylines");

  const folders = xmlBlocks(xml, "Folder").map(parseWaylineFolder);
  if (folders.length === 0) {
    issues.push(error("waylines.folder_missing", "waylines.wpml requires at least one Folder"));
  }

  const waylineIds = new Set<number>();
  const actionGroupIds = new Set<number>();
  for (const [index, folder] of folders.entries()) {
    const path = `folders[${index}]`;
    if (!folder.executeHeightMode) {
      issues.push(error("waylines.height_mode_missing", "Folder requires wpml:executeHeightMode", path));
    }
    if (!Number.isInteger(folder.templateId) || folder.templateId < 0 || folder.templateId > 65_535) {
      issues.push(error("waylines.template_id_invalid", "wpml:templateId must be in [0,65535]", path));
    }
    if (!Number.isInteger(folder.waylineId) || folder.waylineId < 0 || folder.waylineId > 65_535) {
      issues.push(error("waylines.id_invalid", "wpml:waylineId must be in [0,65535]", path));
    } else if (waylineIds.has(folder.waylineId)) {
      issues.push(error("waylines.id_duplicate", "wpml:waylineId must be unique in the document", path));
    }
    waylineIds.add(folder.waylineId);
    if (folder.executeHeightMode && !KNOWN_EXECUTE_HEIGHT_MODES.has(folder.executeHeightMode)) {
      issues.push(warning("waylines.height_mode_unknown", `Unknown executeHeightMode: ${folder.executeHeightMode}`, path));
    }
    if (folder.autoFlightSpeedMps === undefined) {
      issues.push(error("waylines.speed_missing", "wpml:autoFlightSpeed is required", path));
    } else if (folder.autoFlightSpeedMps <= 0) {
      issues.push(error("waylines.speed_invalid", "autoFlightSpeed must be > 0", path));
    }
    validateActionGroups(
      folder.startActionGroups,
      issues,
      `${path}.startActionGroups`,
      actionGroupIds
    );
    validateWaypoints(folder.waypoints, issues, path, actionGroupIds, true);
  }

  return {
    kind: "waylines",
    rawXml: xml,
    ...(namespace ? { namespace } : {}),
    missionConfig,
    folders,
    issues
  };
}

export function parseWpmlBundle(templateXml: string, waylinesXml: string): WpmlBundle {
  const template = parseWpmlTemplate(templateXml);
  const waylines = parseWpmlWaylines(waylinesXml);
  const issues = [...template.issues, ...waylines.issues];

  const templateIds = new Set(template.folders.map((folder) => folder.templateId));
  for (const folder of waylines.folders) {
    if (!templateIds.has(folder.templateId)) {
      issues.push(
        error(
          "bundle.template_reference_missing",
          `waylines.wpml references templateId ${folder.templateId} that is absent from template.kml`
        )
      );
    }
  }

  const templateDrone = template.missionConfig.drone;
  const waylineDrone = waylines.missionConfig.drone;
  if (
    templateDrone &&
    waylineDrone &&
    (templateDrone.enumValue !== waylineDrone.enumValue ||
      templateDrone.subEnumValue !== waylineDrone.subEnumValue)
  ) {
    issues.push(error("bundle.drone_mismatch", "template.kml and waylines.wpml use different droneInfo"));
  }

  const templatePayload = template.missionConfig.payload;
  const waylinePayload = waylines.missionConfig.payload;
  if (
    templatePayload &&
    waylinePayload &&
    (templatePayload.enumValue !== waylinePayload.enumValue ||
      templatePayload.positionIndex !== waylinePayload.positionIndex)
  ) {
    issues.push(error("bundle.payload_mismatch", "template.kml and waylines.wpml use different payloadInfo"));
  }

  return { template, waylines, issues };
}

function parseMissionConfig(xml: string): WpmlMissionConfig {
  const droneXml = xmlBlocks(xml, "droneInfo")[0];
  const payloadXml = xmlBlocks(xml, "payloadInfo")[0];
  const flyToWaylineMode = xmlText(xml, "flyToWaylineMode");
  const finishAction = xmlText(xml, "finishAction");
  const exitOnRCLost = xmlText(xml, "exitOnRCLost");
  const executeRCLostAction = xmlText(xml, "executeRCLostAction");
  const takeOffSecurityHeightM = xmlNumber(xml, "takeOffSecurityHeight");
  const takeOffRefPoint = xmlText(xml, "takeOffRefPoint");
  const takeOffRefPointAglHeightM = xmlNumber(xml, "takeOffRefPointAGLHeight");
  const globalTransitionalSpeedMps = xmlNumber(xml, "globalTransitionalSpeed");
  const globalRthHeightM = xmlNumber(xml, "globalRTHHeight");
  const autoRerouteXml = xmlBlocks(xml, "autoRerouteInfo")[0];
  const autoReroute = autoRerouteXml ? parseAutoRerouteInfo(autoRerouteXml) : undefined;
  const drone = droneXml ? parseDroneInfo(droneXml) : undefined;
  const payload = payloadXml ? parsePayloadInfo(payloadXml) : undefined;

  return {
    rawXml: xml,
    ...(flyToWaylineMode ? { flyToWaylineMode } : {}),
    ...(finishAction ? { finishAction } : {}),
    ...(exitOnRCLost ? { exitOnRCLost } : {}),
    ...(executeRCLostAction ? { executeRCLostAction } : {}),
    ...(takeOffSecurityHeightM !== undefined ? { takeOffSecurityHeightM } : {}),
    ...(takeOffRefPoint ? { takeOffRefPoint } : {}),
    ...(takeOffRefPointAglHeightM !== undefined ? { takeOffRefPointAglHeightM } : {}),
    ...(globalTransitionalSpeedMps !== undefined ? { globalTransitionalSpeedMps } : {}),
    ...(globalRthHeightM !== undefined ? { globalRthHeightM } : {}),
    ...(autoReroute ? { autoReroute } : {}),
    ...(drone ? { drone } : {}),
    ...(payload ? { payload } : {})
  };
}

function parseAutoRerouteInfo(xml: string): WpmlAutoRerouteInfo {
  const missionAutoRerouteMode = wpmlBoolean(xmlText(xml, "missionAutoRerouteMode"));
  const transitionalAutoRerouteMode = wpmlBoolean(
    xmlText(xml, "transitionalAutoRerouteMode")
  );
  return {
    ...(missionAutoRerouteMode !== undefined ? { missionAutoRerouteMode } : {}),
    ...(transitionalAutoRerouteMode !== undefined
      ? { transitionalAutoRerouteMode }
      : {})
  };
}

function parseDroneInfo(xml: string): WpmlDroneInfo | undefined {
  const enumValue = xmlNumber(xml, "droneEnumValue");
  if (enumValue === undefined) return undefined;
  const subEnumValue = xmlNumber(xml, "droneSubEnumValue");
  const key = `${enumValue}:${subEnumValue ?? "*"}`;
  const model = DRONE_MODELS[key] ?? DRONE_MODELS[`${enumValue}:*`];
  return {
    enumValue,
    ...(subEnumValue !== undefined ? { subEnumValue } : {}),
    ...(model ? { model } : {})
  };
}

function parsePayloadInfo(xml: string): WpmlPayloadInfo | undefined {
  const enumValue = xmlNumber(xml, "payloadEnumValue");
  const positionIndex = xmlNumber(xml, "payloadPositionIndex");
  if (enumValue === undefined || positionIndex === undefined) return undefined;
  const model = PAYLOAD_MODELS[enumValue];
  return {
    enumValue,
    positionIndex,
    ...(model ? { model } : {})
  };
}

function parseTemplateFolder(xml: string): WpmlTemplateFolder {
  const coordinateXml = xmlBlocks(xml, "waylineCoordinateSysParam")[0] ?? "";
  const templateType = xmlText(xml, "templateType") ?? "";
  const autoFlightSpeedMps = xmlNumber(xml, "autoFlightSpeed");
  const coordinateMode = xmlText(coordinateXml, "coordinateMode");
  const heightMode = xmlText(coordinateXml, "heightMode");
  const positioningType = xmlText(coordinateXml, "positioningType");
  const payloadParamXml = xmlBlocks(xml, "payloadParam")[0];
  const payloadParam = payloadParamXml
    ? parseTemplatePayloadParam(payloadParamXml)
    : undefined;

  return {
    rawXml: xml,
    templateType,
    templateId: xmlNumber(xml, "templateId") ?? -1,
    ...(autoFlightSpeedMps !== undefined ? { autoFlightSpeedMps } : {}),
    ...(coordinateMode ? { coordinateMode } : {}),
    ...(heightMode ? { heightMode } : {}),
    ...(positioningType ? { positioningType } : {}),
    ...(payloadParam ? { payloadParam } : {}),
    // Mapping templates describe areas/strips rather than executable waypoint
    // points. Keep those geometries in rawXml until a dedicated model exists.
    waypoints:
      templateType === "waypoint"
        ? xmlBlocks(xml, "Placemark").map((block) => parseWaypoint(block, false))
        : []
  };
}

function parseTemplatePayloadParam(xml: string): WpmlTemplatePayloadParam {
  const positionIndex = xmlNumber(xml, "payloadPositionIndex");
  const imageFormat = xmlText(xml, "imageFormat");
  return {
    rawXml: xml,
    ...(positionIndex !== undefined ? { positionIndex } : {}),
    ...(imageFormat ? { imageFormat } : {}),
    imageFormats: imageFormat
      ? imageFormat
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []
  };
}

function parseWaylineFolder(xml: string): WpmlWaylineFolder {
  const autoFlightSpeedMps = xmlNumber(xml, "autoFlightSpeed");
  return {
    rawXml: xml,
    templateId: xmlNumber(xml, "templateId") ?? -1,
    waylineId: xmlNumber(xml, "waylineId") ?? -1,
    executeHeightMode: xmlText(xml, "executeHeightMode") ?? "",
    ...(autoFlightSpeedMps !== undefined ? { autoFlightSpeedMps } : {}),
    startActionGroups: xmlBlocks(xml, "startActionGroup").map(parseActionGroup),
    waypoints: xmlBlocks(xml, "Placemark").map((block) => parseWaypoint(block, true))
  };
}

function parseWaypoint(xml: string, execution: boolean): WpmlWaypoint {
  const pointXml = xmlBlocks(xml, "Point")[0] ?? "";
  const coordinates = parseCoordinates(xmlText(pointXml, "coordinates"));
  const executeHeightM = xmlNumber(xml, "executeHeight");
  const templateHeightM = xmlNumber(xml, "height");
  const ellipsoidHeightM = xmlNumber(xml, "ellipsoidHeight");
  const speedMps = xmlNumber(xml, "waypointSpeed");
  const useGlobalSpeed = wpmlBoolean(xmlText(xml, "useGlobalSpeed"));
  const gimbalPitchDeg = xmlNumber(xml, "gimbalPitchAngle");

  return {
    rawXml: xml,
    index: xmlNumber(xml, "index") ?? -1,
    longitude: coordinates?.longitude ?? Number.NaN,
    latitude: coordinates?.latitude ?? Number.NaN,
    ...(execution && executeHeightM !== undefined ? { executeHeightM } : {}),
    ...(!execution && templateHeightM !== undefined ? { templateHeightM } : {}),
    ...(!execution && ellipsoidHeightM !== undefined ? { ellipsoidHeightM } : {}),
    ...(speedMps !== undefined ? { speedMps } : {}),
    ...(useGlobalSpeed !== undefined ? { useGlobalSpeed } : {}),
    ...(gimbalPitchDeg !== undefined ? { gimbalPitchDeg } : {}),
    actionGroups: xmlBlocks(xml, "actionGroup").map(parseActionGroup)
  };
}

function parseActionGroup(xml: string): WpmlActionGroup {
  const triggerXml = xmlBlocks(xml, "actionTrigger")[0] ?? "";
  const triggerParam = xmlNumber(triggerXml, "actionTriggerParam");
  return {
    rawXml: xml,
    id: xmlNumber(xml, "actionGroupId") ?? -1,
    startIndex: xmlNumber(xml, "actionGroupStartIndex") ?? -1,
    endIndex: xmlNumber(xml, "actionGroupEndIndex") ?? -1,
    mode: xmlText(xml, "actionGroupMode") ?? "",
    triggerType: xmlText(triggerXml, "actionTriggerType") ?? "",
    ...(triggerParam !== undefined ? { triggerParam } : {}),
    actions: xmlBlocks(xml, "action").map(parseAction)
  };
}

function parseAction(xml: string): WpmlAction {
  const paramsXml = xmlBlocks(xml, "actionActuatorFuncParam")[0] ?? "";
  return {
    rawXml: xml,
    id: xmlNumber(xml, "actionId") ?? -1,
    actuator: xmlText(xml, "actionActuatorFunc") ?? "",
    params: simpleChildMap(paramsXml)
  };
}

function wpmlBoolean(value: string | undefined): boolean | undefined {
  if (value === "1" || value?.toLowerCase() === "true") return true;
  if (value === "0" || value?.toLowerCase() === "false") return false;
  return undefined;
}

function validateMissionConfig(
  config: WpmlMissionConfig,
  issues: WpmlValidationIssue[],
  path: string,
  documentKind: "template" | "waylines"
): void {
  if (!config.flyToWaylineMode) {
    issues.push(error("mission.fly_to_mode_missing", "wpml:flyToWaylineMode is required", path));
  } else if (!KNOWN_FLY_TO_MODES.has(config.flyToWaylineMode)) {
    issues.push(warning("mission.fly_to_mode_unknown", `Unknown flyToWaylineMode: ${config.flyToWaylineMode}`, path));
  }

  if (!config.finishAction) {
    issues.push(error("mission.finish_action_missing", "wpml:finishAction is required", path));
  } else if (!KNOWN_FINISH_ACTIONS.has(config.finishAction)) {
    issues.push(warning("mission.finish_action_unknown", `Unknown finishAction: ${config.finishAction}`, path));
  }

  if (!config.exitOnRCLost) {
    issues.push(error("mission.rc_lost_mode_missing", "wpml:exitOnRCLost is required", path));
  } else if (!KNOWN_RC_LOST_MODES.has(config.exitOnRCLost)) {
    issues.push(warning("mission.rc_lost_mode_unknown", `Unknown exitOnRCLost: ${config.exitOnRCLost}`, path));
  }

  if (config.exitOnRCLost === "executeLostAction" && !config.executeRCLostAction) {
    issues.push(error("mission.rc_lost_action_missing", "executeRCLostAction is required when exitOnRCLost=executeLostAction", path));
  }
  if (config.executeRCLostAction && !KNOWN_RC_LOST_ACTIONS.has(config.executeRCLostAction)) {
    issues.push(warning("mission.rc_lost_action_unknown", `Unknown executeRCLostAction: ${config.executeRCLostAction}`, path));
  }

  if (config.takeOffSecurityHeightM === undefined) {
    issues.push(error("mission.takeoff_height_missing", "wpml:takeOffSecurityHeight is required", path));
  } else if (config.takeOffSecurityHeightM < 1.2 || config.takeOffSecurityHeightM > 1500) {
    issues.push(
      error(
        "mission.takeoff_height_invalid",
        "takeOffSecurityHeight must be in the DJI remote-controller range [1.2,1500] m; dock routes may require at least 8 m",
        path
      )
    );
  }

  if (config.globalTransitionalSpeedMps === undefined) {
    issues.push(error("mission.global_speed_missing", "wpml:globalTransitionalSpeed is required", path));
  } else if (
    documentKind === "template"
      ? config.globalTransitionalSpeedMps <= 0
      : config.globalTransitionalSpeedMps < 0 || config.globalTransitionalSpeedMps > 15
  ) {
    issues.push(
      error(
        "mission.global_speed_invalid",
        documentKind === "template"
          ? "template.kml globalTransitionalSpeed must be > 0"
          : "waylines.wpml globalTransitionalSpeed must be in [0,15]",
        path
      )
    );
  }

  if (documentKind === "waylines" && config.globalRthHeightM === undefined) {
    issues.push(
      error(
        "mission.global_rth_height_missing",
        "waylines.wpml requires wpml:globalRTHHeight",
        path
      )
    );
  } else if (
    documentKind === "waylines" &&
    config.globalRthHeightM !== undefined &&
    (config.globalRthHeightM < 2 || config.globalRthHeightM > 1500)
  ) {
    issues.push(
      error(
        "mission.global_rth_height_invalid",
        "globalRTHHeight must be in [2,1500] m",
        path
      )
    );
  }

  if (config.autoReroute) {
    if (config.autoReroute.missionAutoRerouteMode === undefined) {
      issues.push(
        error(
          "mission.auto_reroute_mode_missing",
          "autoRerouteInfo requires missionAutoRerouteMode",
          path
        )
      );
    }
    if (config.autoReroute.transitionalAutoRerouteMode === undefined) {
      issues.push(
        error(
          "mission.transitional_auto_reroute_mode_missing",
          "autoRerouteInfo requires transitionalAutoRerouteMode",
          path
        )
      );
    }
  }

  if (
    config.payload &&
    (!Number.isInteger(config.payload.positionIndex) ||
      config.payload.positionIndex < 0 ||
      config.payload.positionIndex > 2)
  ) {
    issues.push(error("mission.payload_position_invalid", "payloadPositionIndex must be in [0,2]", path));
  }

  if (config.drone && !config.drone.model) {
    issues.push(
      warning(
        "mission.drone_unknown",
        `Unknown WPML drone enum ${config.drone.enumValue}/${config.drone.subEnumValue ?? "?"}`,
        path
      )
    );
  }

  if (config.payload && !config.payload.model) {
    issues.push(
      warning(
        "mission.payload_unknown",
        `Unknown WPML payload enum ${config.payload.enumValue}`,
        path
      )
    );
  }
}

function validateWaypoints(
  waypoints: WpmlWaypoint[],
  issues: WpmlValidationIssue[],
  path: string,
  actionGroupIds: Set<number>,
  execution: boolean
): void {
  const waypointIndexes = new Set<number>();

  for (const [index, waypoint] of waypoints.entries()) {
    const waypointPath = `${path}.waypoints[${index}]`;
    if (!Number.isInteger(waypoint.index) || waypoint.index < 0 || waypoint.index > 65_535) {
      issues.push(error("waypoint.index_invalid", "wpml:index must be in [0,65535]", waypointPath));
    } else if (waypointIndexes.has(waypoint.index)) {
      issues.push(error("waypoint.index_duplicate", "wpml:index must be unique in a Folder", waypointPath));
    }
    waypointIndexes.add(waypoint.index);
    if (Number.isInteger(waypoint.index) && waypoint.index !== index) {
      issues.push(
        error(
          "waypoint.index_sequence_invalid",
          "wpml:index must increase continuously from 0 in document order",
          waypointPath
        )
      );
    }

    if (!Number.isFinite(waypoint.longitude) || !Number.isFinite(waypoint.latitude)) {
      issues.push(error("waypoint.coordinates_invalid", "Point/coordinates must contain longitude,latitude", waypointPath));
    }

    if (execution && waypoint.executeHeightM === undefined) {
      issues.push(error("waypoint.execute_height_missing", "waylines.wpml waypoint requires wpml:executeHeight", waypointPath));
    }
    if (waypoint.useGlobalSpeed === false && waypoint.speedMps === undefined) {
      issues.push(error("waypoint.speed_missing", "wpml:waypointSpeed is required when useGlobalSpeed=0", waypointPath));
    }
    if (waypoint.speedMps !== undefined && waypoint.speedMps <= 0) {
      issues.push(error("waypoint.speed_invalid", "waypointSpeed must be > 0", waypointPath));
    }

    validateActionGroups(waypoint.actionGroups, issues, waypointPath, actionGroupIds);
  }
}

function validateActionGroups(
  groups: WpmlActionGroup[],
  issues: WpmlValidationIssue[],
  path: string,
  actionGroupIds: Set<number>
): void {
  for (const group of groups) {
    if (!Number.isInteger(group.id) || group.id < 0 || group.id > 65_535) {
      issues.push(error("action_group.id_invalid", "actionGroupId must be in [0,65535]", path));
    } else if (actionGroupIds.has(group.id)) {
      issues.push(error("action_group.id_duplicate", "actionGroupId must be unique within the WPML document", path));
    }
    actionGroupIds.add(group.id);

    if (
      !Number.isInteger(group.startIndex) ||
      !Number.isInteger(group.endIndex) ||
      group.startIndex < 0 ||
      group.endIndex < 0 ||
      group.startIndex > 65_535 ||
      group.endIndex > 65_535 ||
      group.endIndex < group.startIndex
    ) {
      issues.push(error("action_group.range_invalid", "actionGroup start/end indexes must be in [0,65535] and end >= start", path));
    }
    if (group.mode && group.mode !== "sequence") {
      issues.push(warning("action_group.mode_unknown", `Unknown actionGroupMode: ${group.mode}`, path));
    }
    if (!group.triggerType) {
      issues.push(error("action_group.trigger_missing", "actionTriggerType is required", path));
    } else if (!KNOWN_TRIGGER_TYPES.has(group.triggerType)) {
      issues.push(warning("action_group.trigger_unknown", `Unknown actionTriggerType: ${group.triggerType}`, path));
    }
    if (
      (group.triggerType === "multipleTiming" || group.triggerType === "multipleDistance") &&
      (group.triggerParam === undefined || group.triggerParam <= 0)
    ) {
      issues.push(
        error(
          "action_group.trigger_param_invalid",
          "multipleTiming/multipleDistance require actionTriggerParam > 0",
          path
        )
      );
    }

    const actionIds = new Set<number>();
    for (const action of group.actions) {
      if (!Number.isInteger(action.id) || action.id < 0 || action.id > 65_535) {
        issues.push(error("action.id_invalid", "actionId must be in [0,65535]", path));
      } else if (actionIds.has(action.id)) {
        issues.push(error("action.id_duplicate", "actionId must be unique within an actionGroup", path));
      }
      actionIds.add(action.id);
      if (!action.actuator) {
        issues.push(error("action.actuator_missing", "actionActuatorFunc is required", path));
      } else if (!KNOWN_ACTIONS.has(action.actuator)) {
        issues.push(warning("action.actuator_unknown", `Unknown actionActuatorFunc: ${action.actuator}`, path));
      }
    }
  }
}

function validateNamespace(namespace: string | undefined, issues: WpmlValidationIssue[]): void {
  if (!namespace) {
    issues.push(warning("namespace.missing", "WPML namespace declaration is missing"));
  } else if (namespace !== DJI_WPML_NAMESPACE) {
    issues.push(
      warning(
        "namespace.unrecognized",
        `WPML namespace ${namespace} differs from the verified baseline ${DJI_WPML_NAMESPACE}`
      )
    );
  }
}

function error(code: string, message: string, path?: string): WpmlValidationIssue {
  return { level: "error", code, message, ...(path ? { path } : {}) };
}

function warning(code: string, message: string, path?: string): WpmlValidationIssue {
  return { level: "warning", code, message, ...(path ? { path } : {}) };
}
