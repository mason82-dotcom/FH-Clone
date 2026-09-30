import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWpmlPilotEvidence,
  validatePilotStatus
} from "./export-wpml-pilot-evidence.mjs";

const templateXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
  <wpml:author>FH2 synthetic test</wpml:author>
  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
    <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
    <wpml:droneInfo>
      <wpml:droneEnumValue>77</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>66</wpml:payloadEnumValue>
      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
    </wpml:payloadInfo>
  </wpml:missionConfig>
  <Folder>
    <wpml:templateType>waypoint</wpml:templateType>
    <wpml:templateId>0</wpml:templateId>
    <wpml:waylineCoordinateSysParam>
      <wpml:coordinateMode>WGS84</wpml:coordinateMode>
      <wpml:heightMode>EGM96</wpml:heightMode>
      <wpml:positioningType>GPS</wpml:positioningType>
    </wpml:waylineCoordinateSysParam>
    <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>
    <Placemark>
      <Point><coordinates>8.588,49.218</coordinates></Point>
      <wpml:index>0</wpml:index>
      <wpml:height>91.2</wpml:height>
    </Placemark>
  </Folder>
</Document>
</kml>`;

const waylinesXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
    <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
    <wpml:globalRTHHeight>120</wpml:globalRTHHeight>
    <wpml:droneInfo>
      <wpml:droneEnumValue>77</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>66</wpml:payloadEnumValue>
      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
    </wpml:payloadInfo>
  </wpml:missionConfig>
  <Folder>
    <wpml:templateId>0</wpml:templateId>
    <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
    <wpml:waylineId>0</wpml:waylineId>
    <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>
    <Placemark>
      <Point><coordinates>8.588,49.218</coordinates></Point>
      <wpml:index>0</wpml:index>
      <wpml:executeHeight>132.5</wpml:executeHeight>
      <wpml:waypointSpeed>7</wpml:waypointSpeed>
    </Placemark>
  </Folder>
</Document>
</kml>`;

const pilotStatus = {
  enabled: true,
  configured: true,
  readOnly: true,
  workspaceConfigured: true,
  authConfigured: true,
  listRequests: 3,
  lastListRequestAt: "2026-09-30T19:30:00.000Z",
  pilotWebViewListRequests: 1,
  lastPilotWebViewListRequestAt: "2026-09-30T19:30:00.000Z"
};

test("builds redacted evidence only after a native Pilot WebView request", () => {
  const kmz = storedZip([
    ["wpmz/template.kml", templateXml],
    ["wpmz/waylines.wpml", waylinesXml]
  ]);

  const evidence = buildWpmlPilotEvidence({
    kmzBytes: kmz,
    pilotStatus,
    capturedAt: "2026-09-30T20:00:00.000Z",
    realHardware: true
  });

  assert.equal(evidence.schema, "fh2.wpml-pilot-evidence.v1");
  assert.equal(evidence.generatedBy, "DJI Pilot 2");
  assert.equal(evidence.realHardware, true);
  assert.equal(evidence.synthetic, false);
  assert.equal(evidence.redacted, true);
  assert.match(evidence.sourceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(evidence.archiveEntries, [
    "wpmz/template.kml",
    "wpmz/waylines.wpml"
  ]);
  assert.deepEqual(evidence.resourceReferences, []);
  assert.deepEqual(evidence.parserComparison, {
    pass: true,
    checks: {
      missionConfig: true,
      productEnums: true,
      heightModes: true,
      templateWaylineIds: true,
      continuousWaypointIndices: true
    }
  });
  assert.deepEqual(evidence.pilotCatalog, {
    realWorkspace: true,
    responseValidated: true,
    tokenPresentInFixture: false,
    listRequests: 3,
    pilotWebViewListRequests: 1,
    lastPilotWebViewListRequestAt: "2026-09-30T19:30:00.000Z",
    emptyCatalogObserved: true
  });

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("server-secret"), false);
  assert.equal(serialized.includes("workspaceId"), false);
  assert.equal(serialized.includes("8.588"), false);
  assert.equal(serialized.includes("49.218"), false);
});

test("rejects local-only Wayline requests as hardware evidence", () => {
  assert.throws(
    () =>
      validatePilotStatus({
        ...pilotStatus,
        pilotWebViewListRequests: undefined,
        lastPilotWebViewListRequestAt: undefined
      }),
    /No DJI Pilot WebView list request observed/
  );
});

test("rejects a referenced resource that is not present in the KMZ", () => {
  const withMissingResource = waylinesXml.replace(
    "</wpml:missionConfig>",
    "  <wpml:referenceFile>res/missing.jpg</wpml:referenceFile>\n  </wpml:missionConfig>"
  );
  const kmz = storedZip([
    ["wpmz/template.kml", templateXml],
    ["wpmz/waylines.wpml", withMissingResource]
  ]);

  assert.throws(
    () =>
      buildWpmlPilotEvidence({
        kmzBytes: kmz,
        pilotStatus,
        realHardware: true
      }),
    /resource reference missing/
  );
});

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);

    localOffset += local.length + nameBytes.length + data.length;
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralData.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralData, eocd]);
}
