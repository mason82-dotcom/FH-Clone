export const DJI_DOCK3_PRODUCT = {
  domain: 3,
  type: 3,
  subType: 0,
  name: "DJI Dock 3"
} as const;

export const DJI_M4D_PRODUCTS = {
  m4d: {
    domain: 0,
    type: 100,
    subType: 0,
    name: "DJI Matrice 4D",
    payloadIndex: "98-0-0"
  },
  m4td: {
    domain: 0,
    type: 100,
    subType: 1,
    name: "DJI Matrice 4TD",
    payloadIndex: "99-0-0"
  }
} as const;

export const DJI_M4D_VISION_ASSIST_PAYLOAD_INDEX = "176-0-0" as const;

export const DJI_M4D_PROPERTY_TOPICS = {
  osd: "thing/product/{device_sn}/osd",
  state: "thing/product/{device_sn}/state",
  set: "thing/product/{gateway_sn}/property/set"
} as const;

/**
 * Top-level M4D/M4TD property groups explicitly integrated by FH2.
 *
 * This is intentionally not a replacement for DJI's thing-model document.
 * Unknown or newly added DJI properties remain available as raw telemetry.
 */
export const DJI_M4D_PROPERTY_GROUPS = {
  link: ["best_link_gateway", "wireless_link_topo"],
  camera: ["cameras", "type_subtype_gimbalindex"],
  navigation: [
    "track_id",
    "position_state",
    "home_distance",
    "home_latitude",
    "home_longitude",
    "attitude_head",
    "attitude_roll",
    "attitude_pitch",
    "elevation",
    "height",
    "latitude",
    "longitude",
    "vertical_speed",
    "horizontal_speed",
    "mode_code",
    "mode_code_reason",
    "control_source",
    "wind_direction",
    "wind_speed"
  ],
  energy: [
    "battery",
    "total_flight_distance",
    "total_flight_time",
    "serious_low_battery_warning_threshold",
    "low_battery_warning_threshold",
    "remaining_power_for_return_home"
  ],
  limits: [
    "obstacle_avoidance",
    "is_near_area_limit",
    "is_near_height_limit",
    "height_limit",
    "night_lights_state",
    "distance_limit_status",
    "rth_altitude"
  ],
  maintenance: [
    "activation_time",
    "maintain_status",
    "total_flight_sorties",
    "firmware_upgrade_status",
    "compatible_status",
    "firmware_version",
    "gear"
  ],
  psdk: ["psdk_ui_resource", "psdk_widget_values"]
} as const;

/**
 * DJI marks these M4D/M4TD properties/paths as writable.
 * FH2 only records the contract here; it does not automatically expose
 * a public write API or bypass the existing Safety/Control gates.
 */
export const DJI_M4D_WRITABLE_PROPERTY_PATHS = [
  "obstacle_avoidance",
  "height_limit",
  "night_lights_state",
  "distance_limit_status",
  "rth_altitude",
  "remaining_power_for_return_home",
  "type_subtype_gimbalindex.thermal_current_palette_style",
  "type_subtype_gimbalindex.thermal_gain_mode",
  "type_subtype_gimbalindex.thermal_isotherm_state",
  "type_subtype_gimbalindex.thermal_isotherm_upper_limit",
  "type_subtype_gimbalindex.thermal_isotherm_lower_limit"
] as const;

/**
 * wireless_link_topo.secret_code is a DJI link-encryption code and must not
 * escape through raw telemetry, logs or persistence.
 */
export const DJI_M4D_SENSITIVE_PROPERTY_PATHS = [
  "wireless_link_topo.secret_code"
] as const;

export function isDjiM4dSensitivePropertyPath(path: string): boolean {
  const normalized = path.replace(/^data\./, "").toLowerCase();
  return DJI_M4D_SENSITIVE_PROPERTY_PATHS.some(
    (sensitive) =>
      normalized === sensitive ||
      normalized.endsWith("." + sensitive)
  );
}
