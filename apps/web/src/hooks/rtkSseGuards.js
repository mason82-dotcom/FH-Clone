const RTK_FIX_STATES = new Set([
  "not_started",
  "fixing",
  "fixed",
  "failed",
  "unknown"
]);

export function parseSseJsonEvent(event) {
  if (!event || typeof event !== "object" || typeof event.data !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(event.data);
  } catch {
    return undefined;
  }
}

export function asRtkSnapshotPayload(value) {
  const list = Array.isArray(value) ? value : [value];
  if (!list.every(isRtkDeviceSnapshot)) return undefined;
  return list;
}

export function isRtkStatusEvent(value) {
  return (
    isRecord(value) &&
    value.type === "status" &&
    isNonEmptyString(value.deviceId) &&
    isRtkStatusPayload(value.status)
  );
}

export function isRtkTransitionEvent(value) {
  return (
    isRecord(value) &&
    value.type === "fix-transition" &&
    isNonEmptyString(value.deviceId) &&
    isRecord(value.transition) &&
    isNonEmptyString(value.transition.deviceId) &&
    (value.transition.type === "acquired" || value.transition.type === "lost") &&
    isFiniteNumber(value.transition.sampledAt) &&
    typeof value.transition.previousFixed === "boolean" &&
    typeof value.transition.currentFixed === "boolean"
  );
}

function isRtkDeviceSnapshot(value) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.deviceId) &&
    isRtkFixState(value.fixState) &&
    typeof value.airborneRtkFixingMode === "boolean" &&
    isFiniteNumber(value.sampledAt) &&
    typeof value.stale === "boolean" &&
    isFiniteNumber(value.ageMs)
  );
}

function isRtkStatusPayload(value) {
  return (
    isRecord(value) &&
    isRtkFixState(value.fixState) &&
    typeof value.airborneRtkFixingMode === "boolean" &&
    isFiniteNumber(value.sampledAt)
  );
}

function isRtkFixState(value) {
  return typeof value === "string" && RTK_FIX_STATES.has(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
