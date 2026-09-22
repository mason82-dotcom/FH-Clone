# DJI MQTT Security- und Identity-Vertrag

## Status

Verbindlicher Zielvertrag für FH-Clone. Reale RC-Pro-Daten aus Issue #5
verifizieren Session- und Reconnect-Verhalten, ändern aber nicht den
Grundsatz, dass die MQTT Client-ID keine Security Identity ist.

## 1. Identity

```text
credential principal
  -> HTTP AuthN
  -> trusted client_attrs.gateway_sn
  -> HTTP AuthZ
  -> TopologyRegistry
  -> erlaubte Gateway-/Sub-Device-Topics
```

`clientid` und `username` werden protokolliert und validiert, sind aber
nicht alleinige Quelle der Geräteidentität.

Ein Gateway erhält eigene Credentials. Shared Gateway-Credentials sind nicht
zulässig.

## 2. EMQX Authentication

Zielendpunkt:

```http
POST /internal/emqx/authn
```

Erfolgreiche DJI-Gateway-Authentifizierung liefert mindestens:

```json
{
  "result": "allow",
  "is_superuser": false,
  "client_attrs": {
    "role": "dji_gateway",
    "gateway_sn": "..."
  }
}
```

Secrets werden serverseitig nur gehasht gespeichert.

`clientid_override` bleibt deaktiviert, bis reale Pilot-2-Tests zeigen, dass
ein Override keine Session-/Reconnect-Probleme erzeugt.

## 3. EMQX Authorization

Zielendpunkt:

```http
POST /internal/emqx/authz
```

Der Authorizer erhält mindestens:

```text
username
clientid
client_attrs.role
client_attrs.gateway_sn
peerhost
action
topic
qos
```

Die Authorisierung vergleicht Gateway-Topics mit
`client_attrs.gateway_sn`, nicht mit einer vom MQTT-Client frei gewählten
Client-ID.

Sub-Device-Rechte werden ausschließlich über die gelernte
`DjiTopologyRegistry` freigegeben.

## 4. Bootstrap und update_topo

Der Produktionspfad provisioniert das Gateway vor der MQTT-Verbindung:

```text
Gateway-SN
 -> Gateway Credential
 -> Pilot2 MQTT Connect
 -> HTTP AuthN
 -> client_attrs.gateway_sn
 -> sys/product/{gateway_sn}/status
 -> update_topo
 -> device_sn-Zuordnungen
```

`update_topo` erweitert die erlaubte Topologie. Es erzeugt nicht die
Security Identity des MQTT-Principals.

Falls reale Hardware zeigt, dass `gateway_sn` beim Provisioning noch nicht
bekannt ist, wird dafür ein separater kurzlebiger Enrollment-Pfad entworfen.
Der Produktionslistener erhält keinen offenen Wildcard-Bootstrap.

## 5. Basic Link

Der Basic-Link-Pfad verarbeitet dauerhaft nur die dafür erforderlichen
Topic-Klassen.

Gateway-/Device-Uplinks umfassen nach bestätigter Produktsemantik unter
anderem:

```text
sys/product/{gateway_sn}/status
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
thing/product/{gateway_sn}/requests
thing/product/{gateway_sn}/events
thing/product/{gateway_sn}/services_reply
```

Cloud-Downlinks werden capability- und safety-gated freigegeben, z. B.:

```text
thing/product/{gateway_sn}/services
thing/product/{gateway_sn}/property/set
```

Die exakte Gateway-/Sub-Device-Zuordnung weiterer Event-/Service-Topics wird
durch RC-Pro-Tests bestätigt.

## 6. DRC ist eine separate Session

DRC gehört nicht in die permanente Basic-Link-ACL.

```text
Basic Link:
  services / services_reply / status / state / osd / events

DRC Relay:
  drc/down
  drc/up
  heartbeat
  control frames
```

DRC wird nur aufgebaut, wenn alle Bedingungen erfüllt sind:

```text
Safety Stage FC3
+ explizit unterstütztes Produktprofil
+ gültiger Control Lease
+ erfolgreiche DJI Flight Authority
+ erfolgreiche drc_mode_enter-Antwort
+ eigene DRC-Relay-Credentials
```

Default `FC0` hat keine DRC-Rechte.

## 7. Fail Closed

Verbindlich:

```text
authorization.no_match = deny
authorization.ignore_backend_failures = false
is_superuser = false
```

Für dynamische Gateway-Autorisierung wird zunächst kein oder nur ein sehr
kurzer Authz-Cache verwendet, damit `update_topo` und Unpairing schnell
wirksam werden.

Die statische ACL endet für DJI-Gateway-Principals mit deny.

## 8. Interne Service-Sicherung

Die AuthN/AuthZ-Endpunkte werden nicht über die öffentliche Control API
exponiert.

EMQX -> Control API erhält zusätzlich eine interne Service-Authentisierung
und läuft nur im privaten Servicenetz.

## 9. Audit

Erfasst werden:

- Timestamp
- Principal
- Gateway-SN
- Client-ID diagnostisch
- Peer-IP
- Action
- Topic
- Allow/Deny
- Reason
- Request-/Correlation-ID

Nicht protokolliert werden Passwörter, Tokens oder DJI-Secrets.

## 10. Noch real zu verifizieren

Issue #5 liefert:

- echte Pilot-2-MQTT-Client-ID
- echten Username
- Bootstrap-Reihenfolge
- Reconnect-/Persistent-Session-Verhalten
- Gateway-/Sub-Device-Topic-Matrix
- Credential-Fehlerverhalten

Diese Ergebnisse schärfen das Protokollprofil, aber FH-Clone bleibt auch bei
`clientid != gateway_sn` sicher.
