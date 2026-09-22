# FH2 V3.0 Zielarchitektur

## Status

Dieses Dokument definiert den verbindlichen V3.0-Integrationsrahmen.

V3.0 ist **kein Neuaufbau**, sondern die Konsolidierung der bereits auf
`main` vorhandenen FH-Clone-Bausteine.

Die Versionsnummer wird erst beim Release Candidate auf `3.0.0` gesetzt.

## Architektur

```text
FH2 WebUI
   |
   | HTTP / WebSocket
   v
FH2 Control API
   |
   +-- Read APIs
   |    +-- Devices
   |    +-- Telemetry
   |    +-- Topology
   |    +-- RTK
   |    +-- Media
   |    +-- Missions
   |
   +-- Internal APIs
   |    +-- EMQX AuthN
   |    +-- EMQX AuthZ
   |    +-- Audit
   |
   +-- Control Gate
        +-- Safety FC0..FC3
        +-- Control Lease
        +-- DJI Authority
        +-- Dead-Man

          |
          v

Aircraft Core  <---->  PostgreSQL
   |
   +-- DJI Cloud API / MQTT
   +-- MSDK V5 Bridge
   +-- UgCS GroundStation Adapter
   +-- spätere Adapter

DJI MQTT:
   Basic Link  !=  DRC Relay
```

## Verbindliche Regeln

1. Der Aircraft Core bleibt SDK-neutral.
2. Raw Messages werden verlustfrei erhalten.
3. Normalisierte Parameter verwenden stabile kanonische Schlüssel.
4. Capabilities werden pro Gerät und Adapter zur Laufzeit bestimmt.
5. `gateway_sn` und `device_sn` bleiben getrennte Identitäten.
6. MQTT `clientid` ist keine Security Identity.
7. EMQX AuthN bindet Credentials an eine vertrauenswürdige `gateway_sn`.
8. EMQX AuthZ verwendet Gateway-Identity plus gelernte Topologie.
9. Basic Link und DRC sind getrennte Sicherheitsdomänen.
10. Default Safety Stage ist FC0.
11. DRC erfordert FC3, Control Lease, DJI Authority und aktive DRC Session.
12. Der Browser besitzt keine direkten MQTT-/Flight-Control-Credentials.
13. Multispektral-/Bandsemantik wird nicht aus Modellnamen geraten.
14. `main` ist die einzige Integrationslinie.

## Runtime

V3.0 muss reproduzierbar starten mit:

```text
control-api
emqx
web
postgres
```

UgCS bleibt ein optionaler Adapterdienst.

## Persistence

Mindestens zu persistieren:

- Raw Messages
- normalisierte Parameter
- Devices
- Gateway/Sub-Device-Topologie
- AuthN/AuthZ Audit
- Media-Metadaten
- Mission-/RTK-Kontext

## DJI MQTT

### Authentication

Ziel:

```http
POST /internal/emqx/authn
```

Credential-Bindung:

```text
principal
 -> username
 -> password_hash
 -> gateway_sn
 -> enabled
```

Erfolgreiche Authentifizierung erzeugt trusted Client Attributes:

```text
role=dji_gateway
gateway_sn=<serverseitig gebundene SN>
```

### Authorization

Ziel:

```http
POST /internal/emqx/authz
```

AuthZ basiert auf:

- trusted role
- trusted gateway_sn
- DjiTopologyRegistry
- action
- topic
- qos

Nicht auf der MQTT Client-ID als Identitätsquelle.

### Basic Link

Basic Link umfasst nur dauerhaft erforderliche DJI Cloud API Topics.

DRC-Rechte gehören nicht in die permanente Basic-Link-ACL.

### DRC

DRC ist session-basiert und nur unter FC3 verfügbar.

Freigabekette:

```text
supported product
+ FC3
+ Control Lease
+ DJI flight authority
+ successful drc_mode_enter
+ DRC relay connected
+ Dead-Man active
= active control session
```

## RC Pro Vertrag

Vor V3 Release Candidate real zu verifizieren:

- MQTT Client-ID
- Username-/Credential-Verhalten
- Gateway-SN
- update_topo Sequenz
- OSD/State Topic-Identität
- Services/Replies
- Reconnect
- Pair/Unpair
- Credential-Fehler
- M3E/M3T/M3M Capability-Matrix
- M4/RC Plus 2 Abweichungen

## Media / Multispektral

V3.0 verwendet folgende fachliche Objekte:

```text
MediaAsset
SensorSource
SpectralBand
CaptureContext
ProcessingProfile
```

Processing Profiles:

```text
GENERIC
RGB
THERMAL
MULTISPECTRAL
NDVI
```

NDVI darf nur READY sein, wenn Red und NIR authoritative identifiziert sind.

## RTK

V3.0 konsolidiert:

- GNSS/RTK Telemetrie
- Fix Status
- Satelliten
- History
- Mission RTK Context
- WebUI

NTRIP-Konfiguration wird nur über tatsächlich unterstützte DJI-Schnittstellen
angeboten.

## UgCS / Mission

UgCS bleibt ein separater GroundStationAdapter.

Unter FC0:

- Missionen lesen
- Routen planen
- Metadaten erzeugen

Mission Execution erfordert mindestens FC2 und separate Freigabe.

## Release Gates

### Build

- npm install reproduzierbar
- TypeScript build
- Typecheck
- Web build

### Runtime

- Root Compose startet
- Control API healthy
- EMQX healthy
- PostgreSQL healthy
- WebUI erreichbar
- Restart ohne Datenverlust

### Tests

- SafetyGate
- ControlAuthority
- TopologyRegistry
- DJI Normalizer
- Service/Reply Correlation
- EMQX AuthN
- EMQX AuthZ
- deny-by-default
- Basic Link ohne DRC
- Media/NDVI Validation

### RC Pro

- reale Verbindung
- update_topo
- Aircraft OSD/State
- Reconnect
- Credential Failure fail-closed
- keine unerlaubten Topics

### Multispektral

- Feld-/Quellenmatrix
- M3M Bandvertrag
- Media-Korrelation
- NDVI Validation

### Safety

- Default FC0
- keine öffentlichen DRC-Control APIs
- DRC nicht in Basic Link
- Control Lease
- Dead-Man
- Kill Switch

## Direktor CI

Erst nach lokaler Erfüllung der Release Gates startet der Direktor die
zentrale CI und bewertet den Release Candidate.

## V3 Feature Freeze

Bis zum Release Candidate werden keine neuen unabhängigen Features aufgenommen.

Erlaubt sind nur Änderungen, die ein Release Gate schließen oder einen
Integrationsfehler beheben.
