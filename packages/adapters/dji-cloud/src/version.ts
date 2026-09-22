export const DJI_CLOUD_API_BASELINE = "1.16.1" as const;

/**
 * Verifizierte Release-Historie, die FH-Clone aktuell kennt.
 * Sie dient der Kompatibilitätsdokumentation und Feature-Gates.
 */
export const DJI_CLOUD_API_RELEASES = {
  "1.15": "2025-06-10",
  "1.16": "2025-11-26",
  "1.16.1": "2025-12-17"
} as const;

export type KnownDjiCloudApiVersion = keyof typeof DJI_CLOUD_API_RELEASES;

function parts(version: string): number[] {
  return version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isDjiCloudApiAtLeast(version: string, minimum: string): boolean {
  const left = parts(version);
  const right = parts(minimum);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}
