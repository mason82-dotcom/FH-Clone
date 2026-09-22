import assert from "node:assert/strict";
import test from "node:test";

import {
  DJI_WPML_NAMESPACE_URI,
  KML_NAMESPACE_URI,
  DjiWpmlParseError,
  parseDjiWpmlTemplateKml
} from "./template-kml.js";

function template(
  missionConfig: string,
  prefix = "wpml"
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NAMESPACE_URI}" xmlns:${prefix}="${DJI_WPML_NAMESPACE_URI}">
  <Document>
    <${prefix}:author>FH2</${prefix}:author>
    <${prefix}:createTime>1637600807044</${prefix}:createTime>
    <${prefix}:updateTime>1637600875837</${prefix}:updateTime>
    ${missionConfig}
    <Folder>
      <${prefix}:templateType>waypoint</${prefix}:templateType>
      <${prefix}:templateId>0</${prefix}:templateId>
    </Folder>
  </Document>
</kml>`;
}

function missionConfig(prefix = "wpml"): string {
  return `<${prefix}:missionConfig>
    <${prefix}:flyToWaylineMode>safely</${prefix}:flyToWaylineMode>
    <${prefix}:finishAction>goHome</${prefix}:finishAction>
    <${prefix}:exitOnRCLost>goContinue</${prefix}:exitOnRCLost>
    <${prefix}:executeRCLostAction>hover</${prefix}:executeRCLostAction>
    <${prefix}:takeOffSecurityHeight>20</${prefix}:takeOffSecurityHeight>
    <${prefix}:takeOffRefPoint>49.10,8.60,123.4</${prefix}:takeOffRefPoint>
    <${prefix}:takeOffRefPointAGLHeight>35</${prefix}:takeOffRefPointAGLHeight>
    <${prefix}:globalTransitionalSpeed>8</${prefix}:globalTransitionalSpeed>
    <${prefix}:droneInfo>
      <${prefix}:droneEnumValue>77</${prefix}:droneEnumValue>
      <${prefix}:droneSubEnumValue>1</${prefix}:droneSubEnumValue>
    </${prefix}:droneInfo>
    <${prefix}:payloadInfo>
      <${prefix}:payloadEnumValue>67</${prefix}:payloadEnumValue>
      <${prefix}:payloadPositionIndex>0</${prefix}:payloadPositionIndex>
    </${prefix}:payloadInfo>
  </${prefix}:missionConfig>`;
}

test("parses DJI template.kml Document and missionConfig", () => {
  const result = parseDjiWpmlTemplateKml(template(missionConfig()));

  assert.equal(result.author, "FH2");
  assert.equal(result.createTimeMs, 1_637_600_807_044);
  assert.equal(result.updateTimeMs, 1_637_600_875_837);

  assert.deepEqual(result.missionConfig, {
    flyToWaylineMode: "safely",
    finishAction: "goHome",
    exitOnRcLost: "goContinue",
    executeRcLostAction: "hover",
    takeOffSecurityHeightM: 20,
    takeOffRefPoint: {
      latitudeDeg: 49.1,
      longitudeDeg: 8.6,
      ellipsoidHeightM: 123.4
    },
    takeOffRefPointAglHeightM: 35,
    globalTransitionalSpeedMps: 8,
    droneInfo: {
      enumValue: 77,
      subEnumValue: 1
    },
    payloadInfo: {
      enumValue: 67,
      positionIndex: 0
    }
  });
});

test("resolves WPML by namespace URI and not by literal prefix", () => {
  const result = parseDjiWpmlTemplateKml(
    template(missionConfig("dji"), "dji")
  );

  assert.equal(result.missionConfig.droneInfo.enumValue, 77);
  assert.equal(result.missionConfig.payloadInfo.enumValue, 67);
});

test("preserves future DJI product enum integers without inventing a model mapping", () => {
  const xml = template(
    missionConfig()
      .replace(
        "<wpml:droneEnumValue>77</wpml:droneEnumValue>",
        "<wpml:droneEnumValue>999</wpml:droneEnumValue>"
      )
      .replace(
        "<wpml:droneSubEnumValue>1</wpml:droneSubEnumValue>",
        "<wpml:droneSubEnumValue>7</wpml:droneSubEnumValue>"
      )
      .replace(
        "<wpml:payloadEnumValue>67</wpml:payloadEnumValue>",
        "<wpml:payloadEnumValue>998</wpml:payloadEnumValue>"
      )
  );

  const result = parseDjiWpmlTemplateKml(xml);
  assert.deepEqual(result.missionConfig.droneInfo, {
    enumValue: 999,
    subEnumValue: 7
  });
  assert.equal(result.missionConfig.payloadInfo.enumValue, 998);
});

test("allows optional creation and takeoff-reference fields to be absent", () => {
  const xml = `<kml xmlns="${KML_NAMESPACE_URI}" xmlns:w="${DJI_WPML_NAMESPACE_URI}">
  <Document>
    <w:missionConfig>
      <w:flyToWaylineMode>pointToPoint</w:flyToWaylineMode>
      <w:finishAction>noAction</w:finishAction>
      <w:exitOnRCLost>executeLostAction</w:exitOnRCLost>
      <w:executeRCLostAction>goBack</w:executeRCLostAction>
      <w:takeOffSecurityHeight>8</w:takeOffSecurityHeight>
      <w:globalTransitionalSpeed>2.5</w:globalTransitionalSpeed>
      <w:droneInfo>
        <w:droneEnumValue>89</w:droneEnumValue>
      </w:droneInfo>
      <w:payloadInfo>
        <w:payloadEnumValue>83</w:payloadEnumValue>
        <w:payloadPositionIndex>2</w:payloadPositionIndex>
      </w:payloadInfo>
    </w:missionConfig>
  </Document>
</kml>`;

  const result = parseDjiWpmlTemplateKml(xml);

  assert.equal(result.author, undefined);
  assert.equal(result.missionConfig.takeOffRefPoint, undefined);
  assert.deepEqual(result.missionConfig.droneInfo, { enumValue: 89 });
  assert.deepEqual(result.missionConfig.payloadInfo, {
    enumValue: 83,
    positionIndex: 2
  });
});

test("requires executeRCLostAction when executeLostAction is selected", () => {
  const xml = template(
    missionConfig()
      .replace("goContinue", "executeLostAction")
      .replace(
        "    <wpml:executeRCLostAction>hover</wpml:executeRCLostAction>\n",
        ""
      )
  );

  assert.throws(
    () => parseDjiWpmlTemplateKml(xml),
    /executeRCLostAction is required/
  );
});

test("rejects a wrong KML namespace even when element names look correct", () => {
  const xml = template(missionConfig()).replace(
    KML_NAMESPACE_URI,
    "urn:not-kml"
  );

  assert.throws(
    () => parseDjiWpmlTemplateKml(xml),
    (error: unknown) =>
      error instanceof DjiWpmlParseError &&
      /Expected KML 2\.2 root element/.test(error.message)
  );
});

test("rejects duplicate singleton missionConfig elements", () => {
  const duplicate = `${missionConfig()}\n${missionConfig()}`;
  assert.throws(
    () => parseDjiWpmlTemplateKml(template(duplicate)),
    /Expected at most one .*missionConfig/
  );
});

test("validates documented core mission units and mounting index", () => {
  assert.throws(
    () =>
      parseDjiWpmlTemplateKml(
        template(
          missionConfig().replace(
            "<wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>",
            "<wpml:takeOffSecurityHeight>0.5</wpml:takeOffSecurityHeight>"
          )
        )
      ),
    /takeOffSecurityHeight/
  );

  assert.throws(
    () =>
      parseDjiWpmlTemplateKml(
        template(
          missionConfig().replace(
            "<wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>",
            "<wpml:payloadPositionIndex>3</wpml:payloadPositionIndex>"
          )
        )
      ),
    /payloadPositionIndex/
  );
});
