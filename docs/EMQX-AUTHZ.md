# EMQX – Authentifizierung und Autorisierung

## Zweck

EMQX ist der MQTT-Broker für den DJI-Basic-Link und interne FH2-Dienste.

Die Sicherheitsarchitektur verwendet mehrere Schutzschichten:

```text
MQTT Client
   |
   v
EMQX AuthN
   |
   v
HTTP AuthZ
   |
   +-- allow / deny
   |
   +-- ignore -> Datei-ACL
                    |
                    +-- kein Treffer -> DENY
```

## Status

### Implementiert

- `POST /internal/emqx/authz`
- Datei-ACL
- Default-Deny
- interner AuthZ-Service-Token
- Topologie-basierte Sub-Device-Prüfung
- Basic Link ohne permanente DRC-Rechte

### V3-Ziel

- `POST /internal/emqx/authn`
- Gateway-Credential-Store
- Passwortprüfung mit starkem Hashverfahren
- trusted `client_attrs.gateway_sn`
- AuthZ ohne Identitätsableitung aus `clientid`
- persistentes Audit


## Interner Authentifizierungsendpunkt

V3 verwendet:

```http
POST http://control-api:8081/internal/emqx/authn
```

EMQX 5.7 unterstützt `client_attrs` in erfolgreichen HTTP-AuthN-Antworten.
`expire_at` wird bewusst **nicht** verwendet, weil dieses Feld erst ab EMQX
5.8 verfügbar ist.

Vorgesehene Anfrage:

```json
{
  "username": "dji-gateway-...",
  "password": "<mqtt-passwort>",
  "clientid": "MQTT-SESSION-ID",
  "peerhost": "10.0.0.20"
}
```

Das Passwort darf ausschließlich für die Verifikation verwendet und niemals
geloggt, auditiert oder persistiert werden.

Erfolgreiche Antwort:

```json
{
  "result": "allow",
  "is_superuser": false,
  "client_attrs": {
    "role": "dji_gateway",
    "gateway_sn": "GATEWAY_SN"
  }
}
```

Fehlerpfade einschließlich unbekanntem Principal, falschem Passwort,
deaktiviertem Credential, ungültiger Bindung oder internem Fehler liefern
**HTTP 200** mit:

```json
{
  "result": "deny",
  "is_superuser": false
}
```

Damit kann ein HTTP-Fehler nicht als `ignore` in eine nachgelagerte
Authenticator-Kette durchfallen.

Für EMQX -> Control API wird ein separater interner Service-Token für AuthN
verwendet:

```env
EMQX_AUTHN_TOKEN=<zufälliges-internes-secret>
```

Der Credential Store darf PostgreSQL verwenden. Das betrifft ausschließlich
Principal-/Credential-Authentisierung.

Weiterhin verboten ist die Nutzung persistierter Daten als Quelle für:

- aktive Gateway↔Aircraft-Autorisierung
- aktuelle `update_topo`-Zuordnung
- aktive DRC-Sitzungen
- FC3-/Lease-/DJI-Authority-Zustand

Diese Zustände bleiben Runtime-only.

## Interner Autorisierungsendpunkt

```http
POST http://control-api:8081/internal/emqx/authz
```

Port `8081` ist ein interner Infrastruktur-Port und darf nicht über den
öffentlichen Reverse Proxy erreichbar sein.

Der Endpunkt ist **kein DJI-Cloud-API-Endpunkt**.

## AuthZ-Anfrage

Der aktuelle Code verarbeitet unter anderem:

```json
{
  "clientid": "MQTT-SESSION-ID",
  "username": "dji-gateway-...",
  "peerhost": "10.0.0.20",
  "topic": "thing/product/AIRCRAFT_SN/osd",
  "action": "publish",
  "qos": "0"
}
```

Für V3 wird die Anfrage zusätzlich um vertrauenswürdige Client-Attribute aus
der vorgelagerten AuthN erweitert, insbesondere:

```text
client_attrs.role
client_attrs.gateway_sn
```

## Antworten

Ausgewertete Entscheidungen werden mit HTTP 200 zurückgegeben:

```json
{"result":"allow"}
```

```json
{"result":"deny"}
```

Für bewusst nachgelagerte statische Rollen:

```json
{"result":"ignore"}
```

Dynamische DJI-Fehler müssen fail-closed behandelt werden. Ein Backendfehler
darf keine breitere Datei-Regel aktivieren.

## Interne Service-Authentisierung

Der aktuelle AuthZ-Endpunkt kann mit:

```env
EMQX_AUTHZ_TOKEN=<zufälliges-internes-secret>
```

abgesichert werden.

Der Token authentifiziert **EMQX gegenüber der Control API**. Er ersetzt nicht
die MQTT-Client-Authentifizierung.

Ohne korrektes internes Secret bleiben dynamische Rechte gesperrt.

## Gateway-Prinzip

Die alte Annahme:

```text
clientid == gateway_sn
```

ist **nicht** mehr Teil der V3-Sicherheitsarchitektur.

V3 verwendet:

```text
Gateway-Credential
 -> HTTP AuthN
 -> trusted gateway_sn
 -> HTTP AuthZ
 -> TopologyRegistry
```

Die reale Client-ID wird weiterhin für Diagnose und Reconnect-Analyse
aufgezeichnet.

## Topologie-Regeln

Nach erfolgreicher Gateway-Authentifizierung darf ein Gateway nur Topics
verwenden, die zu seiner vertrauenswürdigen `gateway_sn` oder zu aktuell
zugeordneten Sub-Devices gehören.

Beispiele:

- eigenes `sys/product/{gateway_sn}/status`
- eigene Gateway-Uplinks
- Aircraft-`osd/state` nur für Geräte aus der aktuellen Topologie
- eigene Downstream-Subscriptions

Fremde Gateway- oder Aircraft-Topics werden verweigert.

## DRC

DRC gehört nicht zum dauerhaften Basic-Link-Authorizer.

V3 verlangt für DRC zusätzlich:

1. FC3
2. Control Lease
3. DJI Control Authority
4. aktive DRC-Sitzung
5. passende Produkt-Capability
6. Dead-Man

Der aktuelle Default bleibt broker- und anwendungsseitig gesperrt.

## Datei-ACL

Statische Rollen wie Backend und Diagnose dürfen weiterhin über die
Datei-ACL abgebildet werden.

Die Datei muss mit einem abschließenden Deny enden:

```erlang
{deny, all}.
```

Produktiv soll die Weboberfläche keine MQTT-Credentials besitzen.

## Cache

Dynamische Gateway-Rechte dürfen nur sehr kurz gecacht werden, weil
`update_topo`, Unpairing und Credential-Deaktivierung schnell wirksam werden
müssen.

Schreibende Services und Property-Set werden nicht über lang laufende
Autorisierungs-Caches freigegeben. DRC wird vollständig vom AuthZ-Cache
ausgeschlossen (`drc/down` und `drc/up`), damit Start, Entzug und Dead-Man-
Übergänge ohne TTL-Nachlauf wirksam werden. Für übrige dynamische Rechte gilt
eine kurze TTL von 1 s.

## Audit und Betrieb

Bei Deny-Entscheidungen mindestens erfassen:

- Principal/Username
- Client-ID
- vertrauenswürdige Gateway-SN
- Aktion
- Topic
- Peer-IP
- Grund

Secrets werden nicht geloggt.

Vor einer produktiven FC3-Freigabe müssen Authorizer-Latenz,
Fehlerverhalten, Cache-Verhalten und Fail-Closed-Verhalten unter Last getestet
werden.

## Weiterführend

Siehe:

- [DJI-MQTT-Sicherheitsvertrag](DJI_MQTT_SECURITY.md)
- [DRC](DRC.md)
- [RC Pro Enterprise](RC_PRO.md)
- [V3-Zielarchitektur](V3_ARCHITECTURE.md)
