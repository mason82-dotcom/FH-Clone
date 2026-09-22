# FH2 V3.0 – verbindliche Zielarchitektur

## Status

Dieses Dokument definiert den Abschlussstand, auf den alle V3-Arbeiten
konvergieren.

V3.0 ist kein Neuaufbau. Vorhandene Bausteine auf `main` werden integriert,
gehärtet, getestet und dokumentiert.

Die Versionsnummer `3.0.0` wird erst beim Release Candidate gesetzt.

## Abschlussziel

```text
FH2-Weboberfläche
   |
   | HTTP / SSE / später bei Bedarf WebSocket
   v
FH2-Control-API
   |
   +-- öffentliche Lese-API
   |    +-- Geräte
   |    +-- Telemetrie
   |    +-- Topologie
   |    +-- RTK
   |    +-- Medien
   |    +-- Missionen
   |
   +-- interne Infrastruktur-API
   |    +-- EMQX AuthN
   |    +-- EMQX AuthZ
   |    +-- Audit
   |
   +-- Steuer-Gate
        +-- Safety FC0..FC3
        +-- Control Lease
        +-- DJI Authority
        +-- DRC-Sitzung
        +-- Dead-Man
        |
        v
Aircraft Core <----> TimescaleDB/PostgreSQL
   |
   +-- DJI Cloud API / MQTT
   +-- MSDK-V5-Bridge
   +-- UgCS-Groundstation-Adapter

DJI MQTT:
  Basic Link != DRC Relay
```

## V3-Grundsätze

1. Core bleibt SDK-neutral.
2. Rohdaten werden verlustfrei erhalten.
3. Normalisierte Werte verwenden stabile Schlüssel.
4. Capabilities werden zur Laufzeit bestimmt.
5. `gateway_sn` und `device_sn` bleiben getrennt.
6. MQTT-`clientid` ist keine Sicherheitsidentität.
7. AuthN bindet Gateway-Credentials serverseitig an `gateway_sn`.
8. AuthZ nutzt vertrauenswürdige Gateway-Attribute plus Topologie.
9. Basic Link und DRC sind getrennte Sicherheitsdomänen.
10. Standard-Safety-Stufe ist FC0.
11. DRC verlangt FC3, Control Lease, DJI Authority und aktive DRC-Sitzung.
12. Der Browser besitzt keine MQTT-/Flight-Control-Credentials.
13. Multispektral-/Bandsemantik wird nicht aus Produktnamen geraten.
14. `main` ist die einzige Integrationslinie.
15. Nach V3.0 endet das Projekt, sofern kein neuer Auftrag erteilt wird.

## Laufzeit-Ziel

Der V3-Gesamtstack muss reproduzierbar gemeinsam startbar sein mit:

```text
control-api
emqx
web
timescaledb
```

UgCS bleibt ein optionaler Adapterdienst.

**Aktueller Status:** Root-Compose und die vier Pflichtdienste sind implementiert.
Der reale gemeinsame Build-/Start-/Restart-Nachweis bleibt wegen des offenen
R1-Lockfile-/Toolchain-Gates ausstehend.

## Persistenz-Ziel

PostgreSQL soll mindestens persistieren:

- Rohmeldungen
- normalisierte Parameter
- automatische Missionssitzungen
- Geräte
- Topologie
- AuthN-/AuthZ-Audit
- Medienmetadaten
- Missions-/RTK-Kontext

**Aktueller Status:** SQL-Schema und automatische Missionspersistenz sind implementiert; Telemetrie-, Raw-, Audit-, Topologie- und Medienpersistenz sind noch nicht vollständig abgenommen.

## DJI MQTT

### Authentifizierung

Implementierter interner Endpunkt:

```http
POST /internal/emqx/authn
```

Vertrauensmodell:

```text
Credential
 -> Principal
 -> password_hash
 -> gateway_sn
 -> trusted client attributes
```

### Autorisierung

Implementierter interner Endpunkt:

```http
POST /internal/emqx/authz
```

Die Entscheidung basiert auf:

- Rolle
- vertrauenswürdiger `gateway_sn`
- gelernter Topologie
- Aktion
- Topic
- QoS

Nicht auf `clientid` als Identitätsquelle.

### Basic Link

Basic Link enthält nur dauerhaft erforderliche DJI-Cloud-Topics.

### DRC

DRC erhält eigene Sitzungs- und Credential-Grenzen.

Aktivierung:

```text
unterstütztes Produkt
+ FC3
+ Control Lease
+ DJI Control Authority
+ drc_mode_enter erfolgreich
+ DRC Relay verbunden
+ Dead-Man aktiv
= aktive Steuerung
```

## RC-Pro-Abnahme

Vor dem V3 Release Candidate real zu bestätigen:

- MQTT-Client-ID
- Username-/Credential-Verhalten
- Zeitpunkt, ab dem `gateway_sn` sicher bekannt ist
- `update_topo`-Sequenz
- Gateway- vs. Aircraft-Topics
- OSD/State
- Services/Replies
- Reconnect
- Pair/Unpair
- Credential-Fehler
- M3E/M3T/M3M-Capabilities
- Matrice-4-/RC-Plus-2-Abweichungen

Diese Tests dürfen die Architektur präzisieren, aber die Security nicht auf
`clientid == gateway_sn` reduzieren.

## Medien und Multispektral

V3 verwendet als fachliches Zielmodell:

```text
MediaAsset
SensorSource
SpectralBand
CaptureContext
ProcessingProfile
```

Profile:

```text
GENERIC
RGB
THERMAL
MULTISPECTRAL
NDVI
```

`NDVI_READY` ist nur zulässig, wenn Red und NIR authoritative identifiziert
sind.

## RTK und NTRIP

Vorhanden sind:

- GNSS-/RTK-Telemetrie
- Fix-Zustand
- Satellitenwerte
- RTK-Historie
- Fix-Wechsel
- sichere Missionsmetadaten
- RTK-Webansicht

Für M3E/M3T/M3M werden NTRIP-Zugangsdaten nicht durch FH-Clone gesetzt, solange
DJI dafür im verwendeten Pilot-Cloud-Pfad keine entsprechende API anbietet.

## UgCS und Missionen

UgCS bleibt ein separater Groundstation-Adapter.

Unter FC0 sind Lesen, Planung und Metadatenbildung zulässig. Eine
Missionsausführung erfordert mindestens FC2 und eine gesonderte Freigabe.

## Release-Gates

### Gate 1 – Build

- [ ] reproduzierbare Installation
- [ ] TypeScript-Build
- [ ] Typecheck
- [ ] Web-Build
- [ ] optionaler UgCS-Bridge-Build

### Gate 2 – Runtime

- [ ] Root Compose startet
- [ ] Control API gesund
- [ ] EMQX gesund
- [ ] PostgreSQL gesund
- [ ] Weboberfläche erreichbar
- [ ] Neustart ohne Datenverlust

### Gate 3 – Tests

- [ ] SafetyGate
- [ ] ControlAuthority
- [ ] TopologyRegistry
- [ ] DJI-Normalizer
- [ ] Service-/Reply-Korrelation
- [ ] EMQX AuthN
- [ ] EMQX AuthZ
- [ ] Default-Deny
- [ ] Basic Link ohne DRC-Rechte
- [ ] Media-/NDVI-Validierung

### Gate 4 – RC Pro

- [ ] reale Basic-Link-Verbindung
- [ ] `update_topo`
- [ ] Aircraft OSD/State
- [ ] Reconnect
- [ ] Credential-Fehler fail-closed
- [ ] keine unerlaubten Topics

### Gate 5 – Multispektral

- [ ] Kamera-/Payload-Feldvertrag
- [ ] M3M-Bandvertrag
- [ ] Media-Korrelation
- [ ] NDVI-Statusregeln

### Gate 6 – Safety

- [ ] FC0 als Standard
- [ ] keine öffentlichen DRC-Steuerendpunkte
- [ ] DRC nicht in Basic Link
- [ ] Control Lease erforderlich
- [ ] Dead-Man vorhanden und getestet
- [ ] Kill Switch getestet

### Gate 7 – Dokumentation

- [x] alle Projektdokumente deutsch
- [x] Implementiert/Ziel/zu verifizieren klar getrennt
- [x] API-/Umgebungsvariablen dokumentiert
- [x] Security-/Safety-Grenzen vollständig
- [x] Betriebs- und Fehlerhinweise vollständig
- [x] keine widersprüchlichen Altstände

### Gate 8 – Direktor-CI

Erst nach lokaler Erfüllung der vorherigen Gates startet der Direktor die
zentrale CI und bewertet den Release Candidate.

## Feature-Freeze

Bis zum Release Candidate sind nur Änderungen erlaubt, die:

- ein Release-Gate schließen,
- einen Integrationsfehler korrigieren,
- einen dokumentierten Sicherheitsfehler beheben oder
- die deutsche Abschlussdokumentation vervollständigen.

Keine neuen SDKs, UI-Sonderfunktionen oder Flugsteuerbefehle.

## Projektabschluss nach V3.0

Nach erfolgreicher V3.0-Abnahme:

- werden die V3-Arbeitspakete geschlossen,
- bleibt `main` als Abschlussstand bestehen,
- wird kein V3.1-/V4-Backlog angelegt,
- endet die Agentenarbeit.

Weitere Entwicklung erfolgt nur nach einem neuen ausdrücklichen Auftrag.

**V3.0 fertig -> Projektstopp -> Feierabend.**
