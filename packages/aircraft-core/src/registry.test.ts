import assert from "node:assert/strict";
import test from "node:test";

import { ParameterRegistry } from "./registry.js";
import type { ParameterSample } from "./types.js";

function sample(
  adapterId: string,
  value: unknown,
  sampledAt: number,
  quality: ParameterSample["quality"] = "unknown"
): ParameterSample {
  return {
    adapterId,
    deviceId: "AIRCRAFT-1",
    key: "flight.position.latitude_deg",
    rawKey: "test",
    value,
    unit: "deg",
    sampledAt,
    quality
  };
}

test("fuses canonical telemetry by newest timestamp and preserves adapter provenance", () => {
  const registry = new ParameterRegistry();

  registry.update(sample("dji-cloud", 49.1, 1_000));
  registry.update(sample("msdk-v5", 49.2, 2_000, "good"));

  assert.equal(
    registry.snapshot("AIRCRAFT-1")[
      "flight.position.latitude_deg"
    ]?.value,
    49.2
  );

  const sources = registry.snapshotSources("AIRCRAFT-1");
  assert.equal(
    sources["flight.position.latitude_deg"]?.["dji-cloud"]?.value,
    49.1
  );
  assert.equal(
    sources["flight.position.latitude_deg"]?.["msdk-v5"]?.value,
    49.2
  );
});

test("older sample from the same adapter cannot roll telemetry back", () => {
  const registry = new ParameterRegistry();

  registry.update(sample("msdk-v5", 49.2, 2_000, "good"));
  registry.update(sample("msdk-v5", 48.0, 1_000, "good"));

  assert.equal(
    registry.snapshot("AIRCRAFT-1")[
      "flight.position.latitude_deg"
    ]?.value,
    49.2
  );
  assert.equal(
    registry.snapshotSources("AIRCRAFT-1")[
      "flight.position.latitude_deg"
    ]?.["msdk-v5"]?.value,
    49.2
  );
});

test("equal timestamps prefer better quality deterministically", () => {
  const registry = new ParameterRegistry();

  registry.update(
    sample("dji-cloud", 49.1, 2_000, "unknown")
  );
  registry.update(
    sample("msdk-v5", 49.2, 2_000, "good")
  );

  const fused =
    registry.snapshot("AIRCRAFT-1")[
      "flight.position.latitude_deg"
    ];

  assert.equal(fused?.adapterId, "msdk-v5");
  assert.equal(fused?.value, 49.2);
});

test("newer invalid observation remains visible instead of reviving stale good data", () => {
  const registry = new ParameterRegistry();

  registry.update(
    sample("dji-cloud", 49.1, 1_000, "good")
  );
  registry.update(
    sample("msdk-v5", null, 2_000, "invalid")
  );

  const fused =
    registry.snapshot("AIRCRAFT-1")[
      "flight.position.latitude_deg"
    ];

  assert.equal(fused?.adapterId, "msdk-v5");
  assert.equal(fused?.quality, "invalid");
  assert.equal(fused?.value, null);
});
