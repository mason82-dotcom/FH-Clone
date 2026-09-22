export interface XmlReaderLimits {
  maxInputBytes: number;
  maxDepth: number;
  maxElements: number;
  maxAttributesPerElement: number;
}

export interface XmlName {
  rawName: string;
  prefix: string | null;
  localName: string;
  namespaceUri: string | null;
}

export interface XmlAttribute {
  name: XmlName;
  value: string;
}

export interface XmlElement {
  name: XmlName;
  attributes: XmlAttribute[];
  children: XmlElement[];
  text: string;
}

export interface XmlDocument {
  root: XmlElement;
}

export class XmlReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlReaderError";
  }
}

const DEFAULT_LIMITS: XmlReaderLimits = {
  maxInputBytes: 16 * 1024 * 1024,
  maxDepth: 64,
  maxElements: 100_000,
  maxAttributesPerElement: 128
};

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_.:-]/;

interface RawAttribute {
  rawName: string;
  value: string;
}

interface ElementFrame {
  element: XmlElement;
  namespaces: Map<string, string>;
}

function splitName(rawName: string): { prefix: string | null; localName: string } {
  const colon = rawName.indexOf(":");
  if (colon < 0) return { prefix: null, localName: rawName };
  if (colon === 0 || colon === rawName.length - 1 || rawName.indexOf(":", colon + 1) >= 0) {
    throw new XmlReaderError(`Invalid qualified XML name: ${rawName}`);
  }
  return {
    prefix: rawName.slice(0, colon),
    localName: rawName.slice(colon + 1)
  };
}

function resolveName(
  rawName: string,
  namespaces: Map<string, string>,
  attribute: boolean
): XmlName {
  const { prefix, localName } = splitName(rawName);
  if (prefix === null) {
    return {
      rawName,
      prefix: null,
      localName,
      namespaceUri: attribute ? null : (namespaces.get("") ?? null)
    };
  }

  const namespaceUri = namespaces.get(prefix);
  if (!namespaceUri) {
    throw new XmlReaderError(`Undeclared XML namespace prefix: ${prefix}`);
  }

  return { rawName, prefix, localName, namespaceUri };
}

function validXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function decodeEntities(value: string): string {
  let output = "";
  let cursor = 0;

  while (cursor < value.length) {
    const ampersand = value.indexOf("&", cursor);
    if (ampersand < 0) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0 || semicolon - ampersand > 32) {
      throw new XmlReaderError("Malformed XML entity reference");
    }

    const entity = value.slice(ampersand + 1, semicolon);
    const predefined: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'"
    };

    if (Object.hasOwn(predefined, entity)) {
      output += predefined[entity];
    } else if (/^#[0-9]+$/.test(entity) || /^#x[0-9A-Fa-f]+$/.test(entity)) {
      const codePoint = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isSafeInteger(codePoint) || !validXmlCodePoint(codePoint)) {
        throw new XmlReaderError(`Invalid XML character reference: &${entity};`);
      }
      output += String.fromCodePoint(codePoint);
    } else {
      throw new XmlReaderError(`Unsupported XML entity: &${entity};`);
    }

    cursor = semicolon + 1;
  }

  return output;
}

class XmlReader {
  private index = 0;
  private root: XmlElement | undefined;
  private readonly stack: ElementFrame[] = [];
  private elementCount = 0;
  private xmlDeclarationSeen = false;

  constructor(
    private readonly xml: string,
    private readonly limits: XmlReaderLimits
  ) {}

  read(): XmlDocument {
    if (Buffer.byteLength(this.xml, "utf8") > this.limits.maxInputBytes) {
      throw new XmlReaderError("XML input exceeds configured size limit");
    }

    if (this.xml.charCodeAt(0) === 0xfeff) this.index = 1;

    while (this.index < this.xml.length) {
      if (this.xml[this.index] !== "<") {
        this.readText();
        continue;
      }

      if (this.xml.startsWith("<!--", this.index)) {
        this.skipComment();
      } else if (this.xml.startsWith("<![CDATA[", this.index)) {
        this.readCdata();
      } else if (this.xml.startsWith("<?", this.index)) {
        this.readProcessingInstruction();
      } else if (this.xml.startsWith("</", this.index)) {
        this.readEndElement();
      } else if (this.xml.startsWith("<!", this.index)) {
        throw new XmlReaderError("DTD, ENTITY and other XML declarations are not allowed");
      } else {
        this.readStartElement();
      }
    }

    if (this.stack.length !== 0) {
      throw new XmlReaderError(`Unclosed XML element: ${this.stack.at(-1)?.element.name.rawName}`);
    }
    if (!this.root) throw new XmlReaderError("XML document has no root element");

    return { root: this.root };
  }

  private readText(): void {
    const next = this.xml.indexOf("<", this.index);
    const end = next < 0 ? this.xml.length : next;
    const raw = this.xml.slice(this.index, end);
    this.index = end;

    if (this.stack.length === 0) {
      if (raw.trim().length !== 0) {
        throw new XmlReaderError("Non-whitespace text outside the XML root element");
      }
      return;
    }

    this.stack.at(-1)!.element.text += decodeEntities(raw);
  }

  private skipComment(): void {
    const end = this.xml.indexOf("-->", this.index + 4);
    if (end < 0) throw new XmlReaderError("Unterminated XML comment");
    if (this.xml.slice(this.index + 4, end).includes("--")) {
      throw new XmlReaderError("XML comments may not contain '--'");
    }
    this.index = end + 3;
  }

  private readCdata(): void {
    if (this.stack.length === 0) {
      throw new XmlReaderError("CDATA outside the XML root element");
    }
    const start = this.index + 9;
    const end = this.xml.indexOf("]]>", start);
    if (end < 0) throw new XmlReaderError("Unterminated CDATA section");
    this.stack.at(-1)!.element.text += this.xml.slice(start, end);
    this.index = end + 3;
  }

  private readProcessingInstruction(): void {
    const end = this.xml.indexOf("?>", this.index + 2);
    if (end < 0) throw new XmlReaderError("Unterminated XML processing instruction");

    const body = this.xml.slice(this.index + 2, end).trim();
    const isXmlDeclaration = /^xml(?:\s|$)/i.test(body);

    if (
      !isXmlDeclaration ||
      this.xmlDeclarationSeen ||
      this.root !== undefined ||
      this.stack.length !== 0
    ) {
      throw new XmlReaderError("Only one leading XML declaration is allowed");
    }

    this.xmlDeclarationSeen = true;
    this.index = end + 2;
  }

  private readStartElement(): void {
    this.index += 1;
    const rawName = this.readName();
    const rawAttributes: RawAttribute[] = [];
    let selfClosing = false;

    while (true) {
      this.skipWhitespace();

      if (this.xml.startsWith("/>", this.index)) {
        selfClosing = true;
        this.index += 2;
        break;
      }
      if (this.xml[this.index] === ">") {
        this.index += 1;
        break;
      }

      if (rawAttributes.length >= this.limits.maxAttributesPerElement) {
        throw new XmlReaderError("XML element exceeds configured attribute limit");
      }

      const attributeName = this.readName();
      this.skipWhitespace();
      if (this.xml[this.index] !== "=") {
        throw new XmlReaderError(`Missing '=' after XML attribute ${attributeName}`);
      }
      this.index += 1;
      this.skipWhitespace();

      const quote = this.xml[this.index];
      if (quote !== '"' && quote !== "'") {
        throw new XmlReaderError(`XML attribute ${attributeName} must be quoted`);
      }
      this.index += 1;

      const end = this.xml.indexOf(quote, this.index);
      if (end < 0) throw new XmlReaderError(`Unterminated XML attribute ${attributeName}`);
      const value = decodeEntities(this.xml.slice(this.index, end));
      this.index = end + 1;
      rawAttributes.push({ rawName: attributeName, value });
    }

    const namespaces = new Map(this.stack.at(-1)?.namespaces ?? [["xml", XML_NAMESPACE]]);

    for (const attribute of rawAttributes) {
      if (attribute.rawName === "xmlns") {
        namespaces.set("", attribute.value);
      } else if (attribute.rawName.startsWith("xmlns:")) {
        const prefix = attribute.rawName.slice(6);
        if (!prefix || prefix === "xmlns") {
          throw new XmlReaderError("Invalid XML namespace declaration");
        }
        if (prefix === "xml" && attribute.value !== XML_NAMESPACE) {
          throw new XmlReaderError("The reserved xml prefix may not be rebound");
        }
        namespaces.set(prefix, attribute.value);
      }
    }

    const name = resolveName(rawName, namespaces, false);
    const attributes: XmlAttribute[] = [];
    const attributeKeys = new Set<string>();

    for (const attribute of rawAttributes) {
      if (attribute.rawName === "xmlns" || attribute.rawName.startsWith("xmlns:")) continue;

      const resolved = resolveName(attribute.rawName, namespaces, true);
      const key = `${resolved.namespaceUri ?? ""}\u0000${resolved.localName}`;
      if (attributeKeys.has(key)) {
        throw new XmlReaderError(`Duplicate XML attribute: ${attribute.rawName}`);
      }
      attributeKeys.add(key);
      attributes.push({ name: resolved, value: attribute.value });
    }

    this.elementCount += 1;
    if (this.elementCount > this.limits.maxElements) {
      throw new XmlReaderError("XML document exceeds configured element limit");
    }
    if (this.stack.length + 1 > this.limits.maxDepth) {
      throw new XmlReaderError("XML document exceeds configured nesting limit");
    }

    const element: XmlElement = {
      name,
      attributes,
      children: [],
      text: ""
    };

    const parent = this.stack.at(-1)?.element;
    if (parent) {
      parent.children.push(element);
    } else if (this.root) {
      throw new XmlReaderError("XML document contains multiple root elements");
    } else {
      this.root = element;
    }

    if (!selfClosing) this.stack.push({ element, namespaces });
  }

  private readEndElement(): void {
    this.index += 2;
    const rawName = this.readName();
    this.skipWhitespace();
    if (this.xml[this.index] !== ">") {
      throw new XmlReaderError(`Malformed closing tag for ${rawName}`);
    }
    this.index += 1;

    const frame = this.stack.pop();
    if (!frame) throw new XmlReaderError(`Unexpected closing tag: ${rawName}`);
    if (frame.element.name.rawName !== rawName) {
      throw new XmlReaderError(
        `Mismatched closing tag: expected </${frame.element.name.rawName}>, got </${rawName}>`
      );
    }
  }

  private readName(): string {
    const first = this.xml[this.index];
    if (!first || !NAME_START.test(first)) {
      throw new XmlReaderError(`Invalid XML name at character ${this.index}`);
    }

    const start = this.index;
    this.index += 1;
    while (this.index < this.xml.length && NAME_CHAR.test(this.xml[this.index]!)) {
      this.index += 1;
    }
    return this.xml.slice(start, this.index);
  }

  private skipWhitespace(): void {
    while (this.index < this.xml.length && /\s/.test(this.xml[this.index]!)) {
      this.index += 1;
    }
  }
}

export function readXmlDocument(
  xml: string,
  limits: Partial<XmlReaderLimits> = {}
): XmlDocument {
  const merged: XmlReaderLimits = {
    maxInputBytes: limits.maxInputBytes ?? DEFAULT_LIMITS.maxInputBytes,
    maxDepth: limits.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxElements: limits.maxElements ?? DEFAULT_LIMITS.maxElements,
    maxAttributesPerElement:
      limits.maxAttributesPerElement ?? DEFAULT_LIMITS.maxAttributesPerElement
  };

  if (
    merged.maxInputBytes <= 0 ||
    merged.maxDepth <= 0 ||
    merged.maxElements <= 0 ||
    merged.maxAttributesPerElement <= 0
  ) {
    throw new XmlReaderError("XML reader limits must be positive");
  }

  return new XmlReader(xml, merged).read();
}
