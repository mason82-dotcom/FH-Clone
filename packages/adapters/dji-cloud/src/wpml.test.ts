import assert from "node:assert/strict";
import test from "node:test";

import {
  createDjiWpmlMissionReference,
  DjiWpmlImportError,
  parseDjiWpmlTemplateKml
} from "./wpml.js";

const SAMPLE = String.raw\`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>FH2 Test</wpml:author>
    <wpml:createTime>1637600807044</wpml:createTime>
    <wpml:updateTime>1637600875837</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>
      <wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
      <wpml:takeOffRefPoint>49.10,8.60,123.4</wpml:takeOffRefPoint>
      <wpml:takeOffRefPointAGLHeight>35</wpml:takeOffRefPointAGLHeight>
      <wpml:globalTransitionalSpeed>8</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>77</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>67</wpml:payloadEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>0</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>EGM96</wpml:heightMode>
        <wpml:globalShootHeight>50</wpml:globalShootHeight>
        <wpml:positioningType>GPS</wpml:positioningType>
        <wpml:surfaceFollowModeEnable>1</wpml:surfaceFollowModeEnable>
        <wpml:surfaceRelativeHeight>100</wpml:surfaceRelativeHeight>
      </wpml:waylineCoordinateSysParam>
      <wpml:autoFlightSpeed>7</wpml:autoFlightSpeed>
      <wpml:payloadParam>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
        <wpml:imageFormat>wide,ir</wpml:imageFormat>
      </wpml:payloadParam>
      <wpml:globalWaypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>45</wpml:waypointHeadingAngle>
        <wpml:waypointHeadingPathMode>clockwise</wpml:waypointHeadingPathMode>
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>0</wpml:globalUseStraightLine>
      <Placemark>
        <Point><coordinates>8.6001,49.1001,130</coordinates></Point>
        <wpml:index>0</wpml:index>
        <wpml:ellipsoidHeight>130</wpml:ellipsoidHeight>
        <wpml:height>50</wpml:height>
        <wpml:useGlobalHeight>1</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed>
        <wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:gimbalPitchAngle>-45</wpml:gimbalPitchAngle>
      </Placemark>
      <Placemark>
        <Point><coordinates>8.6002,49.1002</coordinates></Point>
        <wpml:index>1</wpml:index>
        <wpml:ellipsoidHeight>131</wpml:ellipsoidHeight>
        <wpml:height>51</wpml:height>
        <wpml:useGlobalHeight>0</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>0</wpml:useGlobalSpeed>
        <wpml:waypointSpeed>4.5</wpml:waypointSpeed>
        <wpml:actionGroup>
          <wpml:actionGroupId>0</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>1</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>1</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>0</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:fileSuffix>point1</wpml:fileSuffix>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
        </wpml:actionGroup>
      </Placemark>
    </Folder>
  </Document>
</kml>\`;

test("imports DJI template.kml waypoint planning data without enabling execution", () => {
  const result = parseDjiWpmlTemplateKml(SAMPLE);

  assert.equal(result.format, "template.kml");
  assert.equal(result.wpmlNamespace, "http://www.dji.com/wpmz/1.0.2");
  assert.equal(result.author, "FH2 Test");
  assert.equal(result.missionConfig.drone.enumValue, 77);
  assert.equal(result.missionConfig.drone.subEnumValue, 1);
  assert.equal(result.missionConfig.payload.enumValue, 67);
  assert.deepEqual(result.missionConfig.takeOffRefPoint, {
    latitudeDeg: 49.1,
    longitudeDeg: 8.6,
    ellipsoidHeightM: 123.4
  });

  assert.equal(result.templates.length, 1);
  const template = result.templates[0]!;
  assert.equal(template.type, "waypoint");
  assert.equal(template.id, 0);
  assert.equal(template.autoFlightSpeedMps, 7);
  assert.equal(template.coordinateSystem.coordinateMode, "WGS84");
  assert.equal(template.coordinateSystem.heightMode, "EGM96");
  assert.equal(template.coordinateSystem.surfaceFollowModeEnabled, true);
  assert.deepEqual(template.payloadParams[0]?.imageFormats, ["wide", "ir"]);
  assert.equal(template.globalHeading?.mode, "followWayline");
  assert.equal(template.globalUseStraightLine, false);

  assert.equal(template.waypoints.length, 2);
  assert.deepEqual(
    {
      longitudeDeg: template.waypoints[0]!.longitudeDeg,
      latitudeDeg: template.waypoints[0]!.latitudeDeg,
      kmlAltitudeM: template.waypoints[0]!.kmlAltitudeM
    },
    { longitudeDeg: 8.6001, latitudeDeg: 49.1001, kmlAltitudeM: 130 }
  );
  assert.equal(template.waypoints[1]!.waypointSpeedMps, 4.5);

  const group = template.waypoints[1]!.actionGroups[0]!;
  assert.equal(group.triggerType, "reachPoint");
  assert.equal(group.actions[0]!.actuatorFunc, "takePhoto");
  assert.deepEqual(group.actions[0]!.params, {
    fileSuffix: "point1",
    payloadPositionIndex: "0"
  });

  assert.match(result.sourceXml, /wpml:missionConfig/);
  assert.deepEqual(result.warnings, []);
});

test("keeps unsupported template types importable but marks type-specific normalization incomplete", () => {
  const mapping = SAMPLE
    .replace("<wpml:templateType>waypoint</wpml:templateType>", "<wpml:templateType>mapping2d</wpml:templateType>");

  const result = parseDjiWpmlTemplateKml(mapping);
  assert.equal(result.templates[0]!.type, "mapping2d");
  assert.match(result.warnings[0] ?? "", /mapping2d/);
});

test("requires executeRCLostAction when DJI says to execute the lost-link action", () => {
  const invalid = SAMPLE.replace(
    "<wpml:exitOnRCLost>goContinue</wpml:exitOnRCLost>",
    "<wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>"
  );

  assert.throws(
    () => parseDjiWpmlTemplateKml(invalid),
    /executeRCLostAction is required/
  );
});

test("rejects DTD and ENTITY declarations before parsing", () => {
  const malicious = SAMPLE.replace(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<?xml version=\"1.0\"?><!DOCTYPE kml [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>"
  );
  assert.throws(
    () => parseDjiWpmlTemplateKml(malicious),
    DjiWpmlImportError
  );
});

test("creates a WPML mission reference only from a stable document identifier", () => {
  assert.deepEqual(createDjiWpmlMissionReference("  kmz:abc123  "), {
    kind: "wayline",
    id: "kmz:abc123",
    source: "dji_wpml",
    confidence: "authoritative"
  });

  assert.throws(
    () => createDjiWpmlMissionReference(" "),
    /Stable WPML document id is required/
  );
});
