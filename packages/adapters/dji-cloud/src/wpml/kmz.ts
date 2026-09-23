import { inflateRawSync } from "node:zlib";
import { parseWpmlBundle } from "./parser.js";
import type { WpmlKmzEntry, WpmlKmzPackage } from "./types.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ReadWpmlKmzOptions {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
}

export function readWpmlKmz(
  input: Uint8Array,
  options: ReadWpmlKmzOptions = {}
): WpmlKmzPackage {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const maxEntries = options.maxEntries ?? 1_000;
  const maxEntryBytes = options.maxEntryBytes ?? 16 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 64 * 1024 * 1024;

  const eocdOffset = findEocd(bytes);
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const totalEntries = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);

  if (
    totalEntries === 0xffff ||
    entriesOnDisk === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 WPML KMZ archives are not supported");
  }

  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error("Multi-disk WPML KMZ archives are not supported");
  }
  if (totalEntries > maxEntries) throw new Error("WPML KMZ contains too many entries");
  if (centralOffset + centralSize > eocdOffset || centralOffset > bytes.length) {
    throw new Error("Invalid WPML KMZ central directory bounds");
  }

  const entries: WpmlKmzEntry[] = [];
  const extracted = new Map<string, Buffer>();
  const normalizedPaths = new Set<string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error("Invalid WPML KMZ central directory");
    }

    const flags = bytes.readUInt16LE(cursor + 8);
    const compressionMethod = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 WPML KMZ entries are not supported");
    }

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    const nextCursor = nameEnd + extraLength + commentLength;
    if (nameEnd > bytes.length || nextCursor > centralOffset + centralSize) {
      throw new Error("Invalid WPML KMZ central directory entry bounds");
    }

    const rawPath = bytes.subarray(nameStart, nameEnd).toString("utf8");
    const isDirectory = rawPath.endsWith("/");
    const path = normalizeEntryPath(rawPath);
    cursor = nextCursor;

    if (!path || isDirectory) continue;
    if (normalizedPaths.has(path)) {
      throw new Error(`Duplicate WPML KMZ entry path: ${path}`);
    }
    normalizedPaths.add(path);
    if ((flags & 0x1) !== 0) throw new Error(`Encrypted WPML KMZ entry is not supported: ${path}`);
    if (uncompressedSize > maxEntryBytes) throw new Error(`WPML KMZ entry exceeds size limit: ${path}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxTotalBytes) throw new Error("WPML KMZ exceeds total size limit");

    entries.push({ path, compressedSize, uncompressedSize, compressionMethod });
    extracted.set(
      path,
      extractEntry(bytes, localOffset, compressedSize, uncompressedSize, compressionMethod, path)
    );
  }

  if (cursor !== centralOffset + centralSize) {
    throw new Error("WPML KMZ central directory size mismatch");
  }

  const template = extracted.get("wpmz/template.kml");
  const waylines = extracted.get("wpmz/waylines.wpml");
  if (!template) throw new Error("WPML KMZ requires wpmz/template.kml");
  if (!waylines) throw new Error("WPML KMZ requires wpmz/waylines.wpml");

  const templateXml = template.toString("utf8");
  const waylinesXml = waylines.toString("utf8");
  const resources = [...extracted.keys()].filter((path) => path.startsWith("wpmz/res/"));

  return {
    entries,
    resources,
    templateXml,
    waylinesXml,
    bundle: parseWpmlBundle(templateXml, waylinesXml)
  };
}

function extractEntry(
  bytes: Buffer,
  localOffset: number,
  compressedSize: number,
  uncompressedSize: number,
  compressionMethod: number,
  path: string
): Buffer {
  if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`Invalid WPML KMZ local header: ${path}`);
  }
  const nameLength = bytes.readUInt16LE(localOffset + 26);
  const extraLength = bytes.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > bytes.length) throw new Error(`Invalid WPML KMZ compressed data: ${path}`);

  const compressed = bytes.subarray(start, end);
  let output: Buffer;
  if (compressionMethod === 0) {
    output = Buffer.from(compressed);
  } else if (compressionMethod === 8) {
    output = inflateRawSync(compressed, {
      maxOutputLength: Math.max(uncompressedSize, 1)
    });
  } else {
    throw new Error(`Unsupported WPML KMZ compression method ${compressionMethod}: ${path}`);
  }

  if (output.length !== uncompressedSize) {
    throw new Error(`WPML KMZ size mismatch: ${path}`);
  }
  return output;
}

function findEocd(bytes: Buffer): number {
  const min = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= min; offset -= 1) {
    if (offset >= 0 && bytes.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("Invalid WPML KMZ: end-of-central-directory not found");
}

function normalizeEntryPath(path: string): string {
  if (path.includes("\\")) throw new Error("WPML KMZ entry uses backslash path separators");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new Error("WPML KMZ contains an absolute entry path");
  }
  const parts = path.split("/");
  if (parts.some((part) => part === "..")) {
    throw new Error("WPML KMZ contains a parent-directory entry");
  }
  return parts.filter((part) => part !== "." && part !== "").join("/");
}
