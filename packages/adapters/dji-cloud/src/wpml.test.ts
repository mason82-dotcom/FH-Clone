import assert from "node:assert/strict";
import test from "node:test";

import { readWpmlKmz } from "./wpml/kmz.js";
import { parseWpmlBundle } from "./wpml/parser.js";

const templateXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
  <wpml:author>FH2 Test</wpml:author>
  <wpml:createTime>1700000000000</wpml:createTime>
  <wpml:missionConfig>
    <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
    <wpml:finishAction>goHome</wpml:finishAction>
    <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
    <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
    <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
    <wpml:droneInfo>
      <wpml:droneEnumValue>77</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>2</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>68</wpml:payloadEnumValue>
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
      <Point><coordinates>8.588000,49.218000</coordinates></Point>
      <wpml:index>0</wpml:index>
      <wpml:ellipsoidHeight>132.5</wpml:ellipsoidHeight>
      <wpml:height>91.2</wpml:height>
      <wpml:actionGroup>
        <wpml:actionGroupId>0</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            <wpml:payloadLensIndex>narrow_band,visable</wpml:payloadLensIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>
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
    <wpml:droneInfo>
      <wpml:droneEnumValue>77</wpml:droneEnumValue>
      <wpml:droneSubEnumValue>2</wpml:droneSubEnumValue>
    </wpml:droneInfo>
    <wpml:payloadInfo>
      <wpml:payloadEnumValue>68</wpml:payloadEnumValue>
      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
    </wpml:payloadInfo>
  </wpml:missionConfig>
  <Folder>
    <wpml:templateId>0</wpml:templateId>
    <wpml:executeHeightMode>WGS84</wpml:executeHeightMode>
    <wpml:waylineId>0</wpml:waylineId>
    <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>
    <Placemark>
      <Point><coordinates>8.588000,49.218000</coordinates></Point>
      <wpml:index>0</wpml:index>
      <wpml:executeHeight>132.5</wpml:executeHeight>
      <wpml:waypointSpeed>7</wpml:waypointSpeed>
      <wpml:actionGroup>
        <wpml:actionGroupId>0</wpml:actionGroupId>
        <wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex>
        <wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex>
        <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
        <wpml:actionTrigger>
          <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
        </wpml:actionTrigger>
        <wpml:action>
          <wpml:actionId>0</wpml:actionId>
          <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
          <wpml:actionActuatorFuncParam>
            <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            <wpml:payloadLensIndex>narrow_band,visable</wpml:payloadLensIndex>
          </wpml:actionActuatorFuncParam>
        </wpml:action>
      </wpml:actionGroup>
    </Placemark>
  </Folder>
</Document>
</kml>`;

test("parses DJI WPML template and execution documents without conflating height references", () => {
  const bundle = parseWpmlBundle(templateXml, waylinesXml);

  assert.deepEqual(bundle.issues.filter((issue) => issue.level === "error"), []);
  assert.equal(bundle.template.missionConfig.drone?.model, "DJI Mavic 3 Multispectral");
  assert.equal(bundle.template.missionConfig.payload?.enumValue, 68);
  assert.equal(bundle.template.folders[0]?.heightMode, "EGM96");
  assert.equal(bundle.waylines.folders[0]?.executeHeightMode, "WGS84");

  const templatePoint = bundle.template.folders[0]?.waypoints[0];
  const executionPoint = bundle.waylines.folders[0]?.waypoints[0];

  assert.equal(templatePoint?.templateHeightM, 91.2);
  assert.equal(templatePoint?.ellipsoidHeightM, 132.5);
  assert.equal(executionPoint?.executeHeightM, 132.5);
  assert.equal(executionPoint?.actionGroups[0]?.actions[0]?.actuator, "takePhoto");
  assert.equal(
    executionPoint?.actionGroups[0]?.actions[0]?.params.payloadLensIndex,
    "narrow_band,visable"
  );
});

test("rejects unsafe XML declarations instead of resolving external entities", () => {
  assert.throws(
    () => parseWpmlBundle("<!DOCTYPE kml><kml/>", waylinesXml),
    /DTD\/entities/
  );
});

test("reads the required WPML files from a KMZ archive and preserves res entries", () => {
  const kmz = storedZip([
    ["wpmz/template.kml", templateXml],
    ["wpmz/waylines.wpml", waylinesXml],
    ["wpmz/res/reference.txt", "fixture"]
  ]);

  const result = readWpmlKmz(kmz);
  assert.equal(result.bundle.template.missionConfig.drone?.subEnumValue, 2);
  assert.deepEqual(result.resources, ["wpmz/res/reference.txt"]);
  assert.equal(result.entries.length, 3);
});

test("requires the exact DJI WPML archive paths", () => {
  const kmz = storedZip([
    ["template.kml", templateXml],
    ["waylines.wpml", waylinesXml]
  ]);
  assert.throws(() => readWpmlKmz(kmz), /wpmz\/template\.kml/);
});


test("rejects duplicate normalized KMZ entry paths", () => {
  const kmz = storedZip([
    ["wpmz/template.kml", templateXml],
    ["wpmz/template.kml", templateXml],
    ["wpmz/waylines.wpml", waylinesXml]
  ]);
  assert.throws(() => readWpmlKmz(kmz), /Duplicate WPML KMZ entry path/);
});


test("keeps mapping template geometry as raw XML instead of misclassifying it as waypoint points", () => {
  const mappingTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
<Document>
  <wpml:missionConfig>
    <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
    <wpml:droneInfo><wpml:droneEnumValue>77</wpml:droneEnumValue><wpml:droneSubEnumValue>2</wpml:droneSubEnumValue></wpml:droneInfo>
    <wpml:payloadInfo><wpml:payloadEnumValue>68</wpml:payloadEnumValue><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:payloadInfo>
  </wpml:missionConfig>
  <Folder>
    <wpml:templateType>mapping2d</wpml:templateType>
    <wpml:templateId>0</wpml:templateId>
    <Placemark>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        8.58,49.21 8.59,49.21 8.59,49.22 8.58,49.21
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Folder>
</Document>
</kml>`;

  const bundle = parseWpmlBundle(mappingTemplate, waylinesXml);
  assert.equal(bundle.template.folders[0]?.templateType, "mapping2d");
  assert.deepEqual(bundle.template.folders[0]?.waypoints, []);
  assert.match(bundle.template.folders[0]?.rawXml ?? "", /<Polygon>/);
  assert.equal(
    bundle.template.issues.some((issue) => issue.code === "waypoint.coordinates_invalid"),
    false
  );
});

test("preserves untyped WPML content as raw XML alongside normalized fields", () => {
  const bundle = parseWpmlBundle(templateXml, waylinesXml);
  assert.match(bundle.template.rawXml, /<wpml:author>FH2 Test<\/wpml:author>/);
  assert.match(bundle.template.missionConfig.rawXml, /<wpml:droneInfo>/);
  assert.match(bundle.waylines.folders[0]?.waypoints[0]?.rawXml ?? "", /<wpml:executeHeight>132\.5<\/wpml:executeHeight>/);
});

function storedZip(entries: Array<[string, string]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
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
