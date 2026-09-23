import assert from "node:assert/strict";
import test from "node:test";

import { getDjiCloudControlProfile } from "./capabilities.js";

const rcPro = { domain: 2, type: 144, subType: 0 };
const rcPlus2 = { domain: 2, type: 174, subType: 0 };

test("M3E/M3T/M3TA behind RC Pro expose drone_control and payload control", () => {
  for (const subType of [0, 1, 3]) {
    const profile = getDjiCloudControlProfile(
      { domain: 0, type: 77, subType },
      rcPro
    );

    assert.equal(profile.flightControl, true);
    assert.equal(profile.stickControl, false);
    assert.equal(profile.droneControl, true);
    assert.equal(profile.flyTo, false);
    assert.equal(profile.payloadControl, true);
    assert.equal(profile.requiresCloudControlAuthority, true);
    assert.equal(profile.drcProfile, "pilot-m3-drone");
    assert.deepEqual(profile.capabilities, []);
  }
});

test("Matrice 4E/4T behind RC Plus 2 expose stick and drone control", () => {
  for (const subType of [0, 1]) {
    const profile = getDjiCloudControlProfile(
      { domain: 0, type: 99, subType },
      rcPlus2
    );

    assert.equal(profile.flightControl, true);
    assert.equal(profile.stickControl, true);
    assert.equal(profile.droneControl, true);
    assert.equal(profile.flyTo, true);
    assert.equal(profile.requiresCloudControlAuthority, true);
    assert.equal(profile.drcProfile, "pilot-m4-stick");
    assert.deepEqual(profile.capabilities, []);
  }
});

test("wrong domains or gateways stay fail-closed", () => {
  const profiles = [
    getDjiCloudControlProfile({ domain: 1, type: 77, subType: 0 }, rcPro),
    getDjiCloudControlProfile(
      { domain: 0, type: 77, subType: 1 },
      { domain: 2, type: 144, subType: 1 }
    ),
    getDjiCloudControlProfile({ domain: 1, type: 99, subType: 1 }, rcPlus2)
  ];

  for (const profile of profiles) {
    assert.equal(profile.flightControl, false);
    assert.equal(profile.stickControl, false);
    assert.equal(profile.droneControl, false);
    assert.equal(profile.drcProfile, "none");
  }
});

test("specialized product controls do not become generic execute capabilities", () => {
  const m3 = getDjiCloudControlProfile(
    { domain: 0, type: 77, subType: 0 },
    rcPro
  );
  const m4 = getDjiCloudControlProfile(
    { domain: 0, type: 99, subType: 1 },
    rcPlus2
  );

  assert.equal(m3.payloadControl, true);
  assert.equal(m3.drcProfile, "pilot-m3-drone");
  assert.equal(m4.drcProfile, "pilot-m4-stick");
  assert.deepEqual(m3.capabilities, []);
  assert.deepEqual(m4.capabilities, []);
});

test("Pilot Cloud profiles never advertise mission.wayline without an execution path", () => {
  const profiles = [
    getDjiCloudControlProfile({ domain: 0, type: 77, subType: 0 }, rcPro),
    getDjiCloudControlProfile({ domain: 0, type: 77, subType: 1 }, rcPro),
    getDjiCloudControlProfile({ domain: 0, type: 77, subType: 3 }, rcPro),
    getDjiCloudControlProfile({ domain: 0, type: 99, subType: 0 }, rcPlus2),
    getDjiCloudControlProfile({ domain: 0, type: 99, subType: 1 }, rcPlus2)
  ];

  for (const profile of profiles) {
    assert.equal(profile.capabilities.includes("mission.wayline"), false);
  }
});
