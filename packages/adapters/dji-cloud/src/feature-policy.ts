import type { DjiProductRef } from "./topology.js";

const DISABLED_MULTI_DOCK_KEYS = new Set([
  "multi_dock_task",
  "multi_dock_home_info",
  "wireless_link_topo",
  "best_link_gateway"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Global product policy: all DJI Dock gateways are disabled.
 *
 * DJI defines domain=3 as the Dock namespace, so this covers Dock 1, Dock 2,
 * Dock 3 and future Dock generations unless the policy is deliberately changed.
 */
export function isGloballyDisabledDockProduct(product: DjiProductRef): boolean {
  return String(product.domain ?? "") === "3";
}

/**
 * PSDK service families are globally disabled. Built-in DJI camera payloads are
 * intentionally not affected; only PSDK-specific service methods are blocked.
 */
export function isGloballyDisabledPsdkMethod(method: unknown): boolean {
  return (
    typeof method === "string" &&
    (method.startsWith("psdk_") || method.startsWith("drc_psdk_"))
  );
}

export function isGloballyDisabledMultiDockMethod(method: unknown): boolean {
  return typeof method === "string" && method.toLowerCase().includes("multi_dock");
}

export function containsGloballyDisabledMultiDockData(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsGloballyDisabledMultiDockData(item));
  }
  if (!isRecord(value)) return false;

  for (const [key, child] of Object.entries(value)) {
    if (DISABLED_MULTI_DOCK_KEYS.has(key)) return true;
    if (containsGloballyDisabledMultiDockData(child)) return true;
  }
  return false;
}

/**
 * Removes globally disabled feature data before raw persistence, normalization
 * or frontend delivery. This prevents PSDK and Multi-Dock telemetry from
 * becoming an accidental runtime capability while preserving built-in DJI
 * camera payloads such as M3T/M4T camera entries.
 */
export function sanitizeGloballyDisabledDjiFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGloballyDisabledDjiFields(item));
  }
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.startsWith("psdk_")) continue;
    if (DISABLED_MULTI_DOCK_KEYS.has(lower)) continue;
    sanitized[key] = sanitizeGloballyDisabledDjiFields(child);
  }
  return sanitized;
}

export function getGloballyDisabledServiceReason(
  method: string,
  data: unknown
): string | undefined {
  if (isGloballyDisabledPsdkMethod(method)) {
    return "PSDK payload services are globally disabled";
  }
  if (
    isGloballyDisabledMultiDockMethod(method) ||
    containsGloballyDisabledMultiDockData(data)
  ) {
    return "Multi-Dock services are globally disabled";
  }
  return undefined;
}
