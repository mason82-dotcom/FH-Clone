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

    assert.equal(profile.flightControl, true);
    assert.equal(profile.flyTo, false);
    assert.equal(profile.pointingFlight, false);
    assert.equal(profile.orbitFlight, false);
    assert.equal(profile.payloadControl, false);
    assert.equal(profile.requiresCloudControlAuthority, false);
    assert.equal(profile.drcProfile, "pilot-m4-stick");
    assert.deepEqual(profile.capabilities, []);
  }
});

test("Matrice 4E/4T behind RC Plus 2 expose gated stick and drone control", () => {
  for (const subType of [0, 1]) {
    const profile = getDjiCloudControlProfile(
      { domain: 0, type: 99, subType },
      rcPlus2
    );

    assert.equal(profile.flightControl, false);
    assert.equal(profile.droneControl, true);
    assert.equal(profile.flyTo, true);
    assert.equal(profile.pointingFlight, false);
    assert.equal(profile.orbitFlight, false);
    assert.equal(profile.payloadControl, false);
    assert.equal(profile.requiresCloudControlAuthority, true);
    assert.equal(profile.drcProfile, "none");

    assert.deepEqual(profile.capabilities, []);
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


test("documented product support does not imply generic adapter execution", () => {
  const m3 = getDjiCloudControlProfile(
    { domain: 0, type: 77, subType: 0 },
    rcPro
  );
  const m4 = getDjiCloudControlProfile(
    { domain: 0, type: 99, subType: 1 },
    rcPlus2
  );

  assert.equal(m3.payloadControl, false);
  assert.equal(m3.flightControl, false);
  assert.equal(m3.droneControl, false);
  assert.equal(m3.drcProfile, "none");
  assert.deepEqual(m3.capabilities, []);

  assert.equal(m4.payloadControl, false);
  assert.equal(m4.flightControl, true);
  assert.equal(m4.droneControl, true);
  assert.equal(m4.flyTo, true);
  assert.equal(m4.pointingFlight, false);
  assert.equal(m4.orbitFlight, false);
  assert.equal(m4.drcProfile, "pilot-m4-stick");
  assert.deepEqual(m4.capabilities, []);
});


test("unimplemented DJI-documented controls stay disabled in V3 runtime", () => {
  const m4 = getDjiCloudControlProfile(
    { domain: 0, type: 99, subType: 0 },
    rcPlus2
  );

  // DJI documents these product functions, but FH2 V3 has no executable
  // runtime path for them yet.
  assert.equal(m4.pointingFlight, false);
  assert.equal(m4.orbitFlight, false);
  assert.equal(m4.payloadControl, false);
  assert.deepEqual(m4.capabilities, []);

  // M4 stick control is enabled only after the RC Plus 2 product/gateway gate.
  assert.equal(m4.flightControl, true);
  assert.equal(m4.flyTo, true);
});

test("Pilot Cloud profiles never advertise mission.wayline without an execution path", () => {
  const profiles = [
    getDjiCloudControlProfile({ domain: 0, type: 77, subType: 0 }, rcPro),
    getDjiCloudControlProfile({ domain: 0, type: 77, subType: 1 }, rcPro),
    getDjiCloudControlProfile({ domain: 0, type: 99, subType: 0 }, rcPlus2),
    getDjiCloudControlProfile({ domain: 0, type: 99, subType: 1 }, rcPlus2)
  ];

  for (const profile of profiles) {
    assert.equal(profile.capabilities.includes("mission.wayline"), false);
  }
});
