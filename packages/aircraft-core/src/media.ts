export type SourceConfidence =
  | "authoritative"
  | "derived"
  | "heuristic"
  | "unavailable";

export type SpectralBandName =
  | "RGB"
  | "GREEN"
  | "RED"
  | "RED_EDGE"
  | "NIR"
  | "THERMAL"
  | "UNKNOWN";

export type SensorSourceKind =
  | "rgb"
  | "thermal"
  | "multispectral"
  | "unknown";

export type ProcessingProfile =
  | "GENERIC"
  | "RGB"
  | "THERMAL"
  | "MULTISPECTRAL"
  | "NDVI";

export type NdviValidationStatus =
  | "NDVI_READY"
  | "NDVI_PARTIAL"
  | "NOT_NDVI_CAPABLE";

export interface SpectralBand {
  name: SpectralBandName;
  confidence: SourceConfidence;
  /** Optional physical center wavelength. Never infer it from a filename. */
  centerNm?: number;
  /** Optional documented tolerance/half-width around centerNm. */
  toleranceNm?: number;
  /** Human-readable source reference, e.g. EXIF/XMP field or manufacturer contract. */
  source?: string;
}

export interface SensorSource {
  id: string;
  kind: SensorSourceKind;
  confidence: SourceConfidence;
  payloadId?: string;
  label?: string;
}

export interface CaptureContext {
  deviceId: string;
  capturedAt?: number;
  missionId?: string;
  payloadId?: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
  ellipsoidHeightM?: number;
  relativeHeightM?: number;
  aircraftYawDeg?: number;
  aircraftPitchDeg?: number;
  aircraftRollDeg?: number;
  gimbalYawDeg?: number;
  gimbalPitchDeg?: number;
  gimbalRollDeg?: number;
  rtkFixed?: boolean;
}

export interface MediaAsset {
  id: string;
  objectKey?: string;
  fileName?: string;
  sensor: SensorSource;
  band?: SpectralBand;
  capture: CaptureContext;
  profile: ProcessingProfile;
  metadata?: Record<string, unknown>;
}

export interface NdviValidationInput {
  /** True only when the dataset is known to originate from a multispectral source. */
  multispectralSource: boolean;
  red?: SpectralBand;
  nir?: SpectralBand;
  /**
   * True only when Red and NIR belong to the same capture context by an
   * authoritative or deterministic derived relation.
   */
  captureCorrelated: boolean;
  /** Conflicting authoritative metadata always blocks automatic NDVI. */
  hasAuthoritativeConflict?: boolean;
  /**
   * False when the numeric inputs are known to be unsuitable for the intended
   * radiometric processing. Undefined means not yet verified.
   */
  radiometricallySuitable?: boolean;
}

export interface NdviValidationResult {
  status: NdviValidationStatus;
  reasons: string[];
}

function isAuthoritativeBand(
  band: SpectralBand | undefined,
  expected: SpectralBandName
): boolean {
  return (
    band?.name === expected &&
    band.confidence === "authoritative"
  );
}

/**
 * Pure domain validation. It never guesses a band from file names, ordering
 * or aircraft model names.
 */
export function evaluateNdviReadiness(
  input: NdviValidationInput
): NdviValidationResult {
  if (!input.multispectralSource) {
    return {
      status: "NOT_NDVI_CAPABLE",
      reasons: ["source_is_not_multispectral"]
    };
  }

  const reasons: string[] = [];

  if (!isAuthoritativeBand(input.red, "RED")) {
    reasons.push("red_not_authoritative");
  }
  if (!isAuthoritativeBand(input.nir, "NIR")) {
    reasons.push("nir_not_authoritative");
  }
  if (!input.captureCorrelated) {
    reasons.push("capture_not_reliably_correlated");
  }
  if (input.hasAuthoritativeConflict) {
    reasons.push("authoritative_metadata_conflict");
  }
  if (input.radiometricallySuitable !== true) {
    reasons.push(
      input.radiometricallySuitable === false
        ? "radiometry_unsuitable"
        : "radiometry_not_verified"
    );
  }

  return reasons.length === 0
    ? { status: "NDVI_READY", reasons: [] }
    : { status: "NDVI_PARTIAL", reasons };
}
