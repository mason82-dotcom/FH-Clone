import assert from "node:assert/strict";
import test from "node:test";

import { getDjiCloudControlProfile } from "./capabilities.js";

const rcPro = { domain: 2, type: 144, subType: 0 };
const rcPlus2 = { domain: 2, type: 174, subType: 0 };

test("M3E/M3T/M3TA behind RC Pro are payload-control only", () => {
  for (const subType of [0, 1, 3]) {
    const profile = getDjiCloudControlProfile(
      { domain: 0, type: 77, subType },
      rcPro
    );

    assert.equal(profile.flightControl, false);
    assert.equal(profile.flyTo, false);
    assert.equal(profile.pointingFlight, false);
    assert.equal(profile.orbitFlight, false);
    assert.equal(profile.payloadControl, true);
    assert.equal(profile.requiresCloudControlAuthority, true);
    assert.equal(profile.drcProfile, "pilot-m3-payload");
    assert.deepEqual(profile.capabilities, [
      "control.camera",
      "control.gimbal",
      "payload.control"
    ]);
  }
});

test("Matrice 4E/4T behind RC Plus 2 expose documented live-control set", () => {
  for (const subType of [0, 1]) {
    const profile = getDjiCloudControlProfile(
      { domain: 0, type: 99, subType },
      rcPlus2
    );

    assert.equal(profile.flightControl, true);
    assert.equal(profile.flyTo, true);
    assert.equal(profile.pointingFlight, true);
    assert.equal(profile.orbitFlight, true);
    assert.equal(profile.payloadControl, true);
    assert.equal(profile.requiresCloudControlAuthority, true);
    assert.equal(profile.drcProfile, "pilot-m4-stick");

    for (const capability of [
      "control.flight",
      "control.rth",
      "control.pointing",
      "control.orbit",
      "control.camera",
      "control.gimbal",
      "payload.control"
    ]) {
      assert.equal(profile.capabilities.includes(capability), true);
    }
  }
});

test("same type in wrong DJI domain never enables cloud control", () => {
  const m3WrongDomain = getDjiCloudControlProfile(
    { domain: 1, type: 77, subType: 0 },
    rcPro
  );
  const m4WrongDomain = getDjiCloudControlProfile(
    { domain: 1, type: 99, subType: 1 },
    rcPlus2
  );

  assert.deepEqual(m3WrongDomain.capabilities, []);
  assert.deepEqual(m4WrongDomain.capabilities, []);
  assert.equal(m3WrongDomain.drcProfile, "none");
  assert.equal(m4WrongDomain.drcProfile, "none");
});

test("unknown or missing aircraft subtype/domain fails closed", () => {
  const unknownM3Subtype = getDjiCloudControlProfile(
    { domain: 0, type: 77, subType: 2 },
    rcPro
  );
  const unknownM4Subtype = getDjiCloudControlProfile(
    { domain: 0, type: 99, subType: 2 },
    rcPlus2
  );
  const missingDomain = getDjiCloudControlProfile(
    { type: 77, subType: 0 },
    rcPro
  );

  assert.deepEqual(unknownM3Subtype.capabilities, []);
  assert.deepEqual(unknownM4Subtype.capabilities, []);
  assert.deepEqual(missingDomain.capabilities, []);
});

test("wrong or incomplete gateway identity fails closed", () => {
  const aircraft = { domain: 0, type: 99, subType: 0 };

  const wrongDomain = getDjiCloudControlProfile(
    aircraft,
    { domain: 0, type: 174, subType: 0 }
  );
  const wrongSubtype = getDjiCloudControlProfile(
    aircraft,
    { domain: 2, type: 174, subType: 1 }
  );
  const missingDomain = getDjiCloudControlProfile(
    aircraft,
    { type: 174, subType: 0 }
  );

  assert.deepEqual(wrongDomain.capabilities, []);
  assert.deepEqual(wrongSubtype.capabilities, []);
  assert.deepEqual(missingDomain.capabilities, []);
});
