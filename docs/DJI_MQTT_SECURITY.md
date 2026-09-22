# DJI-MQTT – Sicherheits- und Identitätsvertrag

## Zweck

Dieses Dokument beschreibt den verbindlichen V3-Vertrag für die
DJI-MQTT-Anbindung über EMQX.

Die zentrale Sicherheitsregel lautet:

```text
MQTT clientid != Sicherheitsidentität
```

Die Client-ID ist Sitzungs- und Diagnoseinformation. Die vertrauenswürdige
Geräteidentität entsteht serverseitig.

## Status

### Implementiert

- EMQX mit Default-Deny
- interner HTTP-Authorizer `POST /internal/emqx/authz`
- Gateway-/Sub-Device-Topologie über `update_topo`
- statische Fallback-ACL
- Basic-Link-/DRC-Trennung
- keine permanenten DRC-Rechte in der Basic-Link-ACL
- interner AuthZ-Service-Token
- FC0 als Standard-Sicherheitsstufe

### V3-Ziel

- `POST /internal/emqx/authn`
- eigener Gateway-Credential-Speicher
- Passwort-Hashing
- serverseitige Bindung Credential -> `gateway_sn`
- vertrauenswürdige EMQX-Client-Attribute
- vollständige Entkopplung der AuthZ von `clientid`
- Audit-Persistenz

### Real zu verifizieren

Mit RC Pro Enterprise beziehungsweise RC Plus 2:

- tatsächliche MQTT-Client-ID
- Username-/Credential-Verhalten
- Reconnect/Persistent Session
- `update_topo`-Reihenfolge
- Pair/Unpair
- Fehlerverhalten bei ungültigen Zugangsdaten

## Vertrauensmodell

```text
Gateway-Credential
  -> EMQX HTTP AuthN
  -> serverseitig gebundener Principal
  -> client_attrs.role=dji_gateway
  -> client_attrs.gateway_sn=<vertraute SN>
  -> EMQX HTTP AuthZ
  -> DjiTopologyRegistry
  -> erlaubte Gateway-/Sub-Device-Topics
```

Weder `username` noch `clientid` dürfen allein eine `gateway_sn` festlegen.

## Gateway-Credential

V3 sieht ein eigenes Credential pro Gateway/Controller vor.

Mindestmodell:

```text
principal_id
username
password_hash
gateway_sn
enabled
created_at
rotated_at
```

Regeln:

- keine Shared Credentials für mehrere Gateways
- Passwort niemals im Klartext persistieren
- Rotation pro Gateway möglich
- deaktivierbare Principals
- keine Secrets in Logs
- keine Secrets in öffentlichen API-Antworten

## EMQX-Authentifizierung

Zielendpunkt:

```http
POST /internal/emqx/authn
```

Erfolgreiche Antwort soll mindestens enthalten:

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

`is_superuser` bleibt immer `false`.

Ein `clientid_override` wird nicht verwendet, solange die reale
Pilot-2-Sitzungslogik nicht ausreichend verifiziert ist.

## EMQX-Autorisierung

Interner Endpunkt:

```http
POST /internal/emqx/authz
```

V3-Zielparameter:

```text
username
clientid
peerhost
client_attrs.role
client_attrs.gateway_sn
action
topic
qos
```

Die Entscheidung basiert auf:

1. authentifizierter Rolle
2. serverseitig gebundener `gateway_sn`
3. gelernter Topologie
4. Aktion
5. Topic
6. optional QoS

## Bootstrap und update_topo

Bevorzugter Produktionspfad:

```text
Gateway wird provisioniert
  -> gateway_sn ist serverseitig bekannt
  -> Credential wird erzeugt und gebunden
  -> Pilot 2 verbindet sich mit EMQX
  -> AuthN setzt trusted gateway_sn
  -> Gateway publiziert sys/product/{gateway_sn}/status
  -> update_topo meldet Sub-Devices
  -> TopologyRegistry erweitert die erlaubten device_sn
```

`update_topo` erweitert die Topologie. Es darf nicht die
Sicherheitsidentität eines noch unbekannten Principals erzeugen.

Falls reale Hardware zeigt, dass die Gateway-SN vor der ersten Verbindung
nicht bekannt sein kann, benötigt V3 einen separaten, kurzlebigen
Enrollment-Pfad. Ein offener Wildcard-Bootstrap auf dem Produktionslistener
ist nicht zulässig.

## Basic Link

Der dauerhafte Basic-Link-Pfad umfasst nur die dafür benötigten Topic-Klassen.

Typische Uplinks:

```text
sys/product/{gateway_sn}/status
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
thing/product/{gateway_sn}/requests
thing/product/{gateway_sn}/events
thing/product/{gateway_sn}/services_reply
```

Typische Cloud-Downlinks, sofern Capability und Safety dies erlauben:

```text
thing/product/{gateway_sn}/services
thing/product/{gateway_sn}/property/set
thing/product/{gateway_sn}/events_reply
thing/product/{gateway_sn}/requests_reply
sys/product/{gateway_sn}/status_reply
```

Die genaue Produktzuordnung wird mit realer Hardware bestätigt.

## DRC ist eine separate Sicherheitsdomäne

DRC gehört nicht in die permanente Basic-Link-ACL.

```text
Basic Link:
  status
  osd
  state
  requests
  events
  services
  replies

DRC-Sitzung:
  eigener Relay-/Credential-Kontext
  drc/down
  drc/up
  heartbeat
  stick/control frames
```

DRC darf nur aktiv werden, wenn alle Bedingungen erfüllt sind:

```text
Produkt unterstützt Cloud-Flugsteuerung
+ Safety Stage FC3
+ gültiger Control Lease
+ gültige DJI Control Authority
+ drc_mode_enter erfolgreich
+ DRC-Relay verbunden
+ Dead-Man aktiv
```

## Fail-Closed

Verbindliche Grundsätze:

```text
authorization.no_match = deny
is_superuser = false
unbekannter Principal = deny
fehlende gateway_sn-Bindung = deny
ungültiges Topic = deny
AuthN/AuthZ-Fehler = deny für dynamische DJI-Rechte
```

Die statische Datei-ACL endet mit `deny`.

Der dynamische AuthZ-Cache muss so kurz sein, dass Pair/Unpair und
Topologieänderungen zeitnah wirksam werden.

## Interne Vertrauensgrenze

Die Endpunkte:

```text
/internal/emqx/authn
/internal/emqx/authz
```

dürfen nicht über die öffentliche FH2-API veröffentlicht werden.

EMQX und Control API kommunizieren im privaten Servicenetz. Zusätzlich ist
eine interne Service-Authentisierung erforderlich. Bei Überschreiten einer
Netzwerk-Vertrauensgrenze ist TLS beziehungsweise mTLS vorzusehen.

## Audit

Mindestens zu protokollieren:

- Zeitpunkt
- Principal
- Username
- Client-ID nur diagnostisch
- `gateway_sn`
- Peer-IP
- Aktion
- Topic
- Entscheidung
- Entscheidungsgrund
- Request-/Correlation-ID

Nicht protokollieren:

- Passwort
- Token
- DRC-Credential
- andere DJI-Secrets

## RC-Pro-Abnahme

Issue #5 muss vor V3-RC mindestens bestätigen:

- reale Client-ID
- realen Username
- Verbindung und Reconnect
- Bootstrap-Reihenfolge
- Gateway-/Aircraft-Topic-Matrix
- Credential-Fehler
- Pair/Unpair

Diese Ergebnisse präzisieren die Sitzungslogik. Sie ändern nicht den
Grundsatz, dass `clientid` keine Sicherheitsidentität ist.
