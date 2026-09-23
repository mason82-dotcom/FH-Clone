const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
};

export function assertSafeXml(xml: string): void {
  const structuralXml = stripXmlComments(xml);
  if (/<!DOCTYPE\b/i.test(structuralXml) || /<!ENTITY\b/i.test(structuralXml)) {
    throw new Error("WPML XML DTD/entities are not supported");
  }
  if (!/<(?:[A-Za-z_][\w.-]*:)?kml\b/i.test(structuralXml)) {
    throw new Error("WPML document is not a KML document");
  }
}

export function xmlNamespace(xml: string): string | undefined {
  return /\bxmlns:wpml\s*=\s*["']([^"']+)["']/i.exec(stripXmlComments(xml))?.[1];
}

export function xmlBlocks(xml: string, localName: string): string[] {
  const name = escapeRegex(localName);
  const structuralXml = stripXmlComments(xml);
  const re = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${name}\\s*>`,
    "gi"
  );
  return [...structuralXml.matchAll(re)].map((match) => match[1] ?? "");
}

export function xmlText(xml: string, localName: string): string | undefined {
  const block = xmlBlocks(xml, localName)[0];
  return block === undefined ? undefined : decodeXml(stripTags(block).trim());
}

export function xmlNumber(xml: string, localName: string): number | undefined {
  const value = xmlText(xml, localName);
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function simpleChildMap(xml: string): Record<string, string> {
  const output: Record<string, string> = {};
  const structuralXml = stripXmlComments(xml);
  const re = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>([^<>]*)<\/(?:[A-Za-z_][\w.-]*:)?\1\s*>/gi;
  for (const match of structuralXml.matchAll(re)) {
    const key = match[1];
    if (!key) continue;
    output[key] = decodeXml((match[2] ?? "").trim());
  }
  return output;
}

export function parseCoordinates(value: string | undefined): {
  longitude: number;
  latitude: number;
} | undefined {
  if (!value) return undefined;
  const [lonRaw, latRaw] = value.split(",").map((part) => part.trim());
  const longitude = Number(lonRaw);
  const latitude = Number(latRaw);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return undefined;
  }
  return { longitude, latitude };
}

function stripXmlComments(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, "");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return ENTITY_MAP[token.toLowerCase()] ?? full;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
