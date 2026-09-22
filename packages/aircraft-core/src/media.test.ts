import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateNdviReadiness,
  type SpectralBand
} from "./media.js";

const red: SpectralBand = {
  name: "RED",
  confidence: "authoritative",
  centerNm: 650,
  toleranceNm: 16,
  source: "DJI Mavic 3M manufacturer contract"
};

const nir: SpectralBand = {
  name: "NIR",
  confidence: "authoritative",
  centerNm: 860,
  toleranceNm: 26,
  source: "DJI Mavic 3M manufacturer contract"
};

test("NDVI is ready only with authoritative Red/NIR and valid correlation", () => {
  assert.deepEqual(
    evaluateNdviReadiness({
      multispectralSource: true,
      red,
      nir,
      captureCorrelated: true,
      radiometricallySuitable: true
    }),
    { status: "NDVI_READY", reasons: [] }
  );
});

test("heuristic band identity never becomes NDVI_READY", () => {
  const heuristicRed: SpectralBand = {
    ...red,
    confidence: "heuristic",
    source: "filename"
  };

  const result = evaluateNdviReadiness({
    multispectralSource: true,
    red: heuristicRed,
    nir,
    captureCorrelated: true,
    radiometricallySuitable: true
  });

  assert.equal(result.status, "NDVI_PARTIAL");
  assert.ok(result.reasons.includes("red_not_authoritative"));
});

test("missing NIR remains partial for a multispectral source", () => {
  const result = evaluateNdviReadiness({
    multispectralSource: true,
    red,
    captureCorrelated: false,
    radiometricallySuitable: true
  });

  assert.equal(result.status, "NDVI_PARTIAL");
  assert.ok(result.reasons.includes("nir_not_authoritative"));
});

test("authoritative metadata conflict blocks automatic NDVI", () => {
  const result = evaluateNdviReadiness({
    multispectralSource: true,
    red,
    nir,
    captureCorrelated: true,
    hasAuthoritativeConflict: true,
    radiometricallySuitable: true
  });

  assert.equal(result.status, "NDVI_PARTIAL");
  assert.ok(result.reasons.includes("authoritative_metadata_conflict"));
});

test("RGB-only source is not NDVI capable", () => {
  assert.deepEqual(
    evaluateNdviReadiness({
      multispectralSource: false,
      captureCorrelated: false
    }),
    {
      status: "NOT_NDVI_CAPABLE",
      reasons: ["source_is_not_multispectral"]
    }
  );
});

test("unverified radiometry remains partial", () => {
  const result = evaluateNdviReadiness({
    multispectralSource: true,
    red,
    nir,
    captureCorrelated: true
  });

  assert.equal(result.status, "NDVI_PARTIAL");
  assert.ok(result.reasons.includes("radiometry_not_verified"));
});
