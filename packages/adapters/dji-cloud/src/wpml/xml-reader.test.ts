import assert from "node:assert/strict";
import test from "node:test";

import { readXmlDocument, XmlReaderError } from "./xml-reader.js";

const KML = "http://www.opengis.net/kml/2.2";
const WPML = "http://www.dji.com/wpmz/1.0.2";

test("resolves default and prefixed namespaces by URI", () => {
  const document = readXmlDocument(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML}" xmlns:dji="${WPML}">
  <Document>
    <dji:missionConfig>
      <dji:finishAction>goHome</dji:finishAction>
    </dji:missionConfig>
  </Document>
</kml>`);

  assert.equal(document.root.name.localName, "kml");
  assert.equal(document.root.name.namespaceUri, KML);

  const kmlDocument = document.root.children[0];
  assert.equal(kmlDocument?.name.localName, "Document");
  assert.equal(kmlDocument?.name.namespaceUri, KML);

  const missionConfig = kmlDocument?.children[0];
  assert.equal(missionConfig?.name.prefix, "dji");
  assert.equal(missionConfig?.name.localName, "missionConfig");
  assert.equal(missionConfig?.name.namespaceUri, WPML);
});

test("decodes only predefined and numeric XML entities", () => {
  const document = readXmlDocument(
    `<root message="A &amp; B">&#65;&#x42;&lt;&gt;&quot;&apos;</root>`
  );

  assert.equal(document.root.attributes[0]?.value, "A & B");
  assert.equal(document.root.text, `AB<>"'`);
});

test("rejects DTD and ENTITY declarations instead of expanding them", () => {
  assert.throws(
    () =>
      readXmlDocument(`<?xml version="1.0"?>
<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<kml>&xxe;</kml>`),
    (error: unknown) =>
      error instanceof XmlReaderError &&
      /DTD, ENTITY/.test(error.message)
  );
});

test("rejects undeclared namespace prefixes", () => {
  assert.throws(
    () => readXmlDocument("<kml><wpml:missionConfig /></kml>"),
    /Undeclared XML namespace prefix/
  );
});

test("rejects custom entity references even without a DTD", () => {
  assert.throws(
    () => readXmlDocument("<root>&custom;</root>"),
    /Unsupported XML entity/
  );
});

test("enforces explicit parser depth and element limits", () => {
  assert.throws(
    () => readXmlDocument("<a><b><c /></b></a>", { maxDepth: 2 }),
    /nesting limit/
  );

  assert.throws(
    () => readXmlDocument("<a><b /><c /></a>", { maxElements: 2 }),
    /element limit/
  );
});

test("rejects non-XML processing instructions", () => {
  assert.throws(
    () => readXmlDocument("<?target unsafe?><root />"),
    /Only one leading XML declaration/
  );
});
