export function queryInt(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;

  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`invalid_query_${name}`);
  }

  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`invalid_query_${name}`);
  }

  return value;
}
