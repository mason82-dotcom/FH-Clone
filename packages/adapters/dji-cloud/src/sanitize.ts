import { isDjiM4dSensitivePropertyPath } from "./m4d-properties.js";

export const DJI_REDACTED_TELEMETRY_VALUE = "[REDACTED]" as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitize(value: unknown, path: string): unknown {
  if (path && isDjiM4dSensitivePropertyPath(path)) {
    return DJI_REDACTED_TELEMETRY_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitize(item, path ? `${path}.${index}` : String(index))
    );
  }

  if (!isRecord(value)) return value;

  const output: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    output[key] = sanitize(child, childPath);
  }
  return output;
}

/**
 * Remove DJI values that must not escape through RawMessage/logging/persistence.
 * The original parsed object is left untouched for protocol-internal handling.
 */
export function sanitizeDjiRawPayload(payload: unknown): unknown {
  return sanitize(payload, "");
}
