import { createHmac, createHash } from "node:crypto";

export interface MappingObjectStoreOptions {
  internalEndpoint: string;
  publicEndpoint: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  mediaBucket: string;
  resultsBucket: string;
  presignTtlSeconds?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface MappingObjectStoreStatus {
  configured: boolean;
  mediaBucket: string;
  resultsBucket: string;
  region: string;
  presignTtlSeconds: number;
}

export class MappingObjectStore {
  private readonly internalEndpoint: URL;
  private readonly publicEndpoint: URL;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly region: string;
  private readonly mediaBucket: string;
  private readonly resultsBucket: string;
  private readonly presignTtlSeconds: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: MappingObjectStoreOptions) {
    this.internalEndpoint = endpoint(options.internalEndpoint, "internalEndpoint");
    this.publicEndpoint = endpoint(options.publicEndpoint, "publicEndpoint");
    this.accessKey = required(options.accessKey, "accessKey");
    this.secretKey = required(options.secretKey, "secretKey");
    this.region = required(options.region ?? "us-east-1", "region");
    this.mediaBucket = bucket(options.mediaBucket, "mediaBucket");
    this.resultsBucket = bucket(options.resultsBucket, "resultsBucket");
    this.presignTtlSeconds = integer(
      options.presignTtlSeconds ?? 3_600,
      60,
      3_600,
      "presignTtlSeconds"
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  status(): MappingObjectStoreStatus {
    return {
      configured: true,
      mediaBucket: this.mediaBucket,
      resultsBucket: this.resultsBucket,
      region: this.region,
      presignTtlSeconds: this.presignTtlSeconds
    };
  }

  presignMediaGet(objectKey: string, seconds?: number): string {
    return this.presign(
      "GET",
      this.publicEndpoint,
      this.mediaBucket,
      objectKey,
      seconds
    );
  }

  presignMediaPut(objectKey: string, seconds?: number): string {
    return this.presign(
      "PUT",
      this.publicEndpoint,
      this.mediaBucket,
      objectKey,
      seconds
    );
  }

  async mediaExists(objectKey: string): Promise<boolean> {
    const url = this.presign(
      "HEAD",
      this.internalEndpoint,
      this.mediaBucket,
      objectKey,
      300
    );
    const response = await this.fetchImpl(url, {
      method: "HEAD",
      redirect: "manual"
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`mapping_media_store_head_http_${response.status}`);
    }
    return true;
  }

  presignResultPut(jobId: string, relativePath: string, seconds?: number): string {
    const path = resultPath(jobId, relativePath);
    return this.presign(
      "PUT",
      this.publicEndpoint,
      this.resultsBucket,
      path,
      seconds
    );
  }

  presignResultGet(jobId: string, relativePath: string, seconds?: number): string {
    const path = resultPath(jobId, relativePath);
    return this.presign(
      "GET",
      this.publicEndpoint,
      this.resultsBucket,
      path,
      seconds
    );
  }

  async resultExists(jobId: string, relativePath: string): Promise<boolean> {
    const path = resultPath(jobId, relativePath);
    const url = this.presign(
      "HEAD",
      this.internalEndpoint,
      this.resultsBucket,
      path,
      300
    );
    const response = await this.fetchImpl(url, {
      method: "HEAD",
      redirect: "manual"
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new Error(`mapping_object_store_head_http_${response.status}`);
    }
    return true;
  }

  async resultPrefixExists(jobId: string, relativePrefix: string): Promise<boolean> {
    const prefix = resultPrefix(jobId, relativePrefix);
    const url = this.presign(
      "GET",
      this.internalEndpoint,
      this.resultsBucket,
      "",
      300,
      {
        "list-type": "2",
        "max-keys": "1",
        prefix
      }
    );
    const response = await this.fetchImpl(url, {
      method: "GET",
      redirect: "manual"
    });
    if (!response.ok) {
      throw new Error(`mapping_object_store_list_http_${response.status}`);
    }
    const xml = await response.text();
    return /<Contents(?:\s|>)/.test(xml) || /<KeyCount>\s*[1-9][0-9]*\s*<\/KeyCount>/.test(xml);
  }

  async ping(): Promise<boolean> {
    try {
      const url = this.presign(
        "GET",
        this.internalEndpoint,
        this.resultsBucket,
        "",
        60,
        {
          "list-type": "2",
          "max-keys": "1"
        }
      );
      const response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual"
      });
      if (response.ok) return true;

      const body = await response.text().catch(() => "");
      const s3Code =
        body.match(/<Code>([^<]{1,80})<\/Code>/)?.[1] ?? "unknown";
      console.warn(
        `[Mapping] object-store readiness failed: HTTP ${response.status}, S3 code ${s3Code}`
      );
      return false;
    } catch (error) {
      console.warn(
        "[Mapping] object-store readiness request failed:",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  private presign(
    method: "GET" | "PUT" | "HEAD",
    endpointUrl: URL,
    bucketName: string,
    objectKey: string,
    seconds?: number,
    extraQuery: Record<string, string> = {}
  ): string {
    const expires = integer(
      seconds ?? this.presignTtlSeconds,
      1,
      3_600,
      "presignSeconds"
    );
    const now = this.now();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const credential = `${this.accessKey}/${scope}`;
    const canonicalUri = objectUri(endpointUrl, bucketName, objectKey);

    const query: Record<string, string> = {
      ...extraQuery,
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": "host"
    };
    const canonicalQuery = queryString(query);
    const canonicalHeaders = `host:${endpointUrl.host}\n`;
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256Hex(canonicalRequest)
    ].join("\n");
    const signingKey = hmac(
      hmac(
        hmac(
          hmac(Buffer.from(`AWS4${this.secretKey}`), dateStamp),
          this.region
        ),
        "s3"
      ),
      "aws4_request"
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");

    const result = new URL(endpointUrl.toString());
    result.pathname = canonicalUri;
    result.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return result.toString();
  }
}

export function createMappingObjectStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch
): MappingObjectStore | undefined {
  const names = [
    "MAPPING_S3_INTERNAL_ENDPOINT",
    "MAPPING_S3_PUBLIC_ENDPOINT",
    "MAPPING_S3_ACCESS_KEY",
    "MAPPING_S3_SECRET_KEY",
    "MAPPING_MEDIA_BUCKET",
    "MAPPING_RESULTS_BUCKET"
  ] as const;
  const present = names.filter((name) => Boolean(env[name]?.trim()));
  if (present.length === 0) return undefined;
  if (present.length !== names.length) {
    const missing = names.filter((name) => !env[name]?.trim());
    throw new Error(`mapping_object_store_incomplete:${missing.join(",")}`);
  }

  return new MappingObjectStore({
    internalEndpoint: env.MAPPING_S3_INTERNAL_ENDPOINT!,
    publicEndpoint: env.MAPPING_S3_PUBLIC_ENDPOINT!,
    accessKey: env.MAPPING_S3_ACCESS_KEY!,
    secretKey: env.MAPPING_S3_SECRET_KEY!,
    mediaBucket: env.MAPPING_MEDIA_BUCKET!,
    resultsBucket: env.MAPPING_RESULTS_BUCKET!,
    region: env.MAPPING_S3_REGION?.trim() || "us-east-1",
    presignTtlSeconds: envInt(env.MAPPING_PRESIGN_TTL_SECONDS, 3_600),
    ...(fetchImpl ? { fetchImpl } : {})
  });
}

export function buildManagedMediaObjectKey(
  assetIdValue: unknown,
  fileNameValue: unknown
): string {
  const assetId = mediaIdentityPart(assetIdValue, "assetId", 512);
  const fileName = mediaFileName(fileNameValue);
  const digest = sha256Hex(`${assetId}\u0000${fileName}`);
  const extension = mediaExtension(fileName);
  return `ingest/${digest.slice(0, 2)}/${digest}${extension}`;
}

export function isManagedMediaObjectKeyForAsset(
  objectKey: unknown,
  assetId: unknown,
  fileName: unknown
): boolean {
  if (typeof objectKey !== "string") return false;
  try {
    return objectKey === buildManagedMediaObjectKey(assetId, fileName);
  } catch {
    return false;
  }
}

export function validateMappingResultPath(value: unknown): string {
  if (typeof value !== "string") throw new Error("mapping_result_path_must_be_string");
  const path = value.trim();
  if (
    path.length < 1 ||
    path.length > 1_024 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..") ||
    !/^[A-Za-z0-9._/-]+$/.test(path)
  ) {
    throw new Error("mapping_result_path_invalid");
  }
  return path;
}

function resultPath(jobId: string, relativePath: string): string {
  return `${safeJobId(jobId)}/${validateMappingResultPath(relativePath)}`;
}

function resultPrefix(jobId: string, relativePrefix: string): string {
  const clean = relativePrefix.endsWith("/")
    ? relativePrefix.slice(0, -1)
    : relativePrefix;
  return `${safeJobId(jobId)}/${validateMappingResultPath(clean)}/`;
}

function safeJobId(value: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) throw new Error("mapping_job_id_invalid");
  return value;
}

function mediaIdentityPart(
  value: unknown,
  field: string,
  max: number
): string {
  if (typeof value !== "string") {
    throw new Error(`media_upload_${field}_must_be_string`);
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) {
    throw new Error(`media_upload_${field}_length_invalid`);
  }
  if (/\0/.test(normalized)) {
    throw new Error(`media_upload_${field}_invalid`);
  }
  return normalized;
}

function mediaFileName(value: unknown): string {
  const fileName = mediaIdentityPart(value, "fileName", 255);
  if (
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    throw new Error("media_upload_fileName_invalid");
  }
  return fileName;
}

function mediaExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  const extension = fileName.slice(dot + 1);
  return /^[A-Za-z0-9]{1,10}$/.test(extension)
    ? `.${extension.toLowerCase()}`
    : "";
}

function endpoint(value: string, field: string): URL {
  const parsed = new URL(required(value, field));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${field}_must_be_http`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${field}_must_not_contain_credentials_query_or_hash`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed;
}

function objectUri(base: URL, bucketName: string, objectKey: string): string {
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/+$/, "");
  const encodedBucket = encodeRfc3986(bucketName);
  const encodedKey = objectKey
    ? "/" + objectKey.split("/").map(encodeRfc3986).join("/")
    : "";
  return `${prefix}/${encodedBucket}${encodedKey}` || "/";
}

function queryString(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([ka, va], [kb, vb]) => compareBytes(ka, kb) || compareBytes(va, vb))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function compareBytes(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hmac(key: Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function bucket(value: string, field: string): string {
  const normalized = required(value, field);
  if (
    normalized.length < 3 ||
    normalized.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(normalized)
  ) {
    throw new Error(`${field}_invalid`);
  }
  return normalized;
}

function integer(
  value: number,
  min: number,
  max: number,
  field: string
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field}_out_of_range`);
  }
  return value;
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
