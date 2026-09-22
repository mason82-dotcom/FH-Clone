import type {
  GroundStationMission,
  GroundStationRoute,
  MissionExternalReference
} from "@fh-clone/aircraft-core";
import { createMissionExternalReference } from "@fh-clone/aircraft-core";
import type { WpmlBundle, WpmlValidationIssue } from "./types.js";

export interface WpmlGroundStationProjectionOptions {
  /**
   * Stable identity supplied by the caller, e.g. Pilot wayline file ID,
   * object key or trusted import ID. FH2 never invents this identity.
   */
  id: string;
  name?: string;
  sourceFileName?: string;
}

export interface WpmlGroundStationProjection {
  mission: GroundStationMission;
  routes: GroundStationRoute[];
  references: MissionExternalReference[];
}

/**
 * Projects a validated DJI WPML bundle into FH2's vendor-neutral read-only
 * ground-station model.
 *
 * This function does not upload, execute or authorize a mission.
 */
export function projectWpmlToGroundStation(
  bundle: WpmlBundle,
  options: WpmlGroundStationProjectionOptions
): WpmlGroundStationProjection {
  const id = options.id.trim();
  if (!id) throw new Error("WPML projection requires a stable source id");

  const errors = bundle.issues.filter((issue) => issue.level === "error");
  if (errors.length > 0) {
    throw new Error(
      `WPML bundle contains validation errors: ${errors.map((issue) => issue.code).join(", ")}`
    );
  }

  const name = options.name?.trim() || options.sourceFileName?.trim() || id;
  const drone = bundle.waylines.missionConfig.drone ?? bundle.template.missionConfig.drone;
  const payload =
    bundle.waylines.missionConfig.payload ?? bundle.template.missionConfig.payload;

  const mission: GroundStationMission = {
    id,
    name,
    format: "dji-wpml",
    metadata: {
      source: "dji_wpml",
      ...(options.sourceFileName?.trim()
        ? { sourceFileName: options.sourceFileName.trim() }
        : {}),
      templateTypes: bundle.template.folders.map((folder) => folder.templateType),
      templateIds: bundle.template.folders.map((folder) => folder.templateId),
      waylineIds: bundle.waylines.folders.map((folder) => folder.waylineId),
      ...(drone
        ? {
            wpmlDrone: {
              enumValue: drone.enumValue,
              ...(drone.subEnumValue !== undefined
                ? { subEnumValue: drone.subEnumValue }
                : {}),
              ...(drone.model ? { model: drone.model } : {})
            }
          }
        : {}),
      ...(payload
        ? {
            wpmlPayload: {
              enumValue: payload.enumValue,
              positionIndex: payload.positionIndex,
              ...(payload.model ? { model: payload.model } : {})
            }
          }
        : {}),
      warnings: publicIssues(bundle.issues)
    }
  };

  const routes: GroundStationRoute[] = bundle.waylines.folders.map((folder) => {
    const routeId = `${id}:wayline:${folder.waylineId}`;
    const points = folder.waypoints.map((waypoint) => ({
      latitudeDeg: waypoint.latitude,
      longitudeDeg: waypoint.longitude,
      ...(folder.executeHeightMode === "WGS84" &&
      waypoint.executeHeightM !== undefined
        ? { altitudeM: waypoint.executeHeightM }
        : {})
    }));

    return {
      id: routeId,
      name: `${name} / Wayline ${folder.waylineId}`,
      segments: [
        {
          id: String(folder.waylineId),
          figureType: "wpml-wayline",
          points
        }
      ],
      metadata: {
        source: "dji_wpml",
        templateId: folder.templateId,
        waylineId: folder.waylineId,
        executeHeightMode: folder.executeHeightMode,
        ...(folder.autoFlightSpeedMps !== undefined
          ? { autoFlightSpeedMps: folder.autoFlightSpeedMps }
          : {}),
        /*
         * Preserve per-waypoint execution heights independently of the neutral
         * altitude field. relativeToStartPoint and realTimeFollowSurface are
         * not WGS84/ellipsoid altitudes and must never be mislabeled as such.
         */
        waypointExecuteHeights: folder.waypoints.map((waypoint) => ({
          index: waypoint.index,
          ...(waypoint.executeHeightM !== undefined
            ? { executeHeightM: waypoint.executeHeightM }
            : {})
        })),
        actionGroupCount:
          folder.startActionGroups.length +
          folder.waypoints.reduce(
            (count, waypoint) => count + waypoint.actionGroups.length,
            0
          )
      }
    };
  });

  const references = bundle.waylines.folders.map((folder) =>
    createMissionExternalReference({
      kind: "wayline",
      id: `${id}#wayline:${folder.waylineId}`,
      source: "dji_wpml",
      confidence: "derived"
    })
  );

  return { mission, routes, references };
}

function publicIssues(issues: readonly WpmlValidationIssue[]) {
  return issues
    .filter((issue) => issue.level === "warning")
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
      ...(issue.path ? { path: issue.path } : {})
    }));
}
