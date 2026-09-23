# FH-Clone – FH2 V3.0

FH-Clone ist die modulare, lokale Integrationsplattform für DJI-Enterprise-
Fluggeräte, FlightHub-2-nahe Funktionen, DJI Cloud API, RTK, Medien,
Multispektral-Verarbeitung und Groundstation-Anbindung.

Der freigegebene Basisstand ist **FH2 V3.0.0**. Der Release ist als
Software-/FC0-Basisstand definiert. DJI Dock 1–3, Multi-Dock und
PSDK-Payloads sind projektweit deaktiviert. Für Mavic 3 Enterprise + RC Pro
ist nur Cloud-Payload-Control vorgesehen; Cloud-Flugsteuerung bleibt dort
gesperrt. Matrice 4 + RC Plus 2 besitzt das separate Cloud-Flight-Control-
Profil. Reale Hardwarefreigaben benötigen weiterhin die dokumentierte Abnahme.

## Projektziel

FH-Clone vereinheitlicht unterschiedliche DJI- und Groundstation-Schnittstellen
hinter einem SDK-neutralen Kern. Externe Protokolle bestimmen nicht die
interne Domäne.

Die Plattform unterscheidet konsequent:

1. **Rohdaten** – unveränderte Nachrichten des jeweiligen Adapters.
2. **Normalisierte Telemetrie** – stabile, herstellerunabhängige Schlüssel.
3. **Fähigkeiten** – zur Laufzeit ermittelte Lese-, Schreib- und
   Steuerungsmöglichkeiten.
4. **Steuerhoheit** – eindeutige Freigabe, welcher Adapter ein Gerät steuern
   darf.
5. **Sicherheitsstufen** – FC0 bis FC3 für schreibende und flugkritische
   Funktionen.

## V3-Zielarchitektur

```text
FH2-Weboberfläche
      |
      | HTTP / Server-Sent Events / später WebSocket
      v
FH2-Control-API
      |
      +-- Geräte / Telemetrie / Topologie
      +-- RTK / GNSS
      +-- Medien / Multispektral
      +-- Missionen / UgCS
      +-- EMQX AuthN / AuthZ
      +-- Audit
      +-- Safety / Control Authority
      |
      +------ TimescaleDB/PostgreSQL
      |
      v
SDK-neutraler Aircraft Core
      |
      +-- DJI Cloud API / MQTT
      +-- MSDK-V5-Bridge
      +-- UgCS-Groundstation-Adapter
      +-- spätere, ausdrücklich freigegebene Adapter
```

Für DJI MQTT gilt zusätzlich:

```text
Basic Link != DRC
```

Basic Link ist die dauerhafte Geräte-/Telemetrieverbindung. DRC ist eine
separate, sitzungsbasierte Sicherheitsdomäne und bleibt standardmäßig
gesperrt.

## Bereits vorhanden

Auf `main` sind unter anderem vorhanden:

- SDK-neutraler Aircraft Core
- Geräte-, Parameter- und Capability-Registry
- SafetyGate mit FC0 bis FC3
- Control Lease und Control Authority
- DJI-Cloud-MQTT-Adapter
- Gateway-/Sub-Device-Topologie
- Service-/Reply-Korrelation
- DJI-Cloud-Control-Authority
- DRC-Transport und Dead-Man-Sitzungslogik
- RTK-/GNSS-Normalisierung und RTK-Live-API
- RTK-Weboberfläche mit Satellitenverlauf
- sichere RTK-Missionsmetadaten
- Payload-Profile
- UgCS-Groundstation-Adapter und UCS-Bridge
- EMQX-HTTP-Autorisierung mit Default-Deny
- dokumentierte Trennung von Basic Link und DRC
- EMQX HTTP AuthN mit serverseitiger Credential-→-`gateway_sn`-Bindung
- Root-Compose für Control API, EMQX, Web und TimescaleDB
- lokale Runtime-Verify-Suite
- FlightHub-2-OpenAPI-V2-Client für Waylines und Flight Tasks (read-only)
- DJI-WPML/KMZ-Parser für `template.kml` und `waylines.wpml` (read-only)
- DJI-Pilot-Waypoint-Dateikatalog (read-only)
- Android-MSDK-V5-Bridge mit KeyManager-Runtimeinventar und read-only Hardware-Probes
- Pilot-2-JSBridge read-only Runtime mit exaktem RC-/Aircraft-Topologie-Match
- read-only Mission-/Wayline-/Capability-APIs

Nicht Bestandteil der V3.0.0-Hardware-Supportzusage sind insbesondere:

- M4E/M4T Cloud-Flight-Control (`stick_control`/`drone_control`) ohne reale DRC-/Authority-Hardwareabnahme
- M3E/M3T/M3TA Cloud-Payload-Control ohne reale RC-Pro-/Payload-Hardwareabnahme
- DJI Dock 1–3 / Multi-Dock / PSDK-Payloads: global deaktiviert
- Pilot-2-JSBridge-Hardwarefreigabe ohne reales WebView-Evidence-Fixture
- schreibende WPML/Pilot-Wayline-Upload-, Collect- und Execution-Pfade
- produktive M3M-Radiometrie/NDVI ohne reale M3M-Fixtures
- nicht real belegte M3T/M4T Tele-/Thermal-Medienpfade
- vollständige MSDK-KeyManager-Hardwarematrix ohne reales Runtime-Evidence-Fixture

## Sicherheitsmodell

Die Standardstufe ist **FC0**.

| Stufe | Bedeutung |
| --- | --- |
| FC0 | Analyse und Lesen; keine realen Steuer-Downlinks |
| FC1 | kontrollierte, nicht flugkritische Schreibzugriffe |
| FC2 | Missions-/Task-Steuerung |
| FC3 | Flugsteuerung, RTH und DRC |

Vor einer flugkritischen Steuerung müssen mindestens erfüllt sein:

```text
unterstütztes Produktprofil
+ FC3
+ gültiger Control Lease
+ DJI Control Authority
+ aktive DRC-Sitzung
+ Dead-Man aktiv
```

Die bloße Existenz von DRC-Code aktiviert keine Steuerfunktion.

## DJI-MQTT-Identität

Die MQTT-Client-ID ist **keine Sicherheitsidentität**.

V3 verwendet als Zielmodell:

```text
Gateway-Credential
  -> EMQX HTTP-Authentifizierung
  -> trusted gateway_sn
  -> EMQX HTTP-Autorisierung
  -> gelernte Gateway-/Aircraft-Topologie
  -> erlaubte Topics
```

Dadurch bleibt die Autorisierung sicher, auch wenn Pilot 2 eine Client-ID
verwendet, die nicht der `gateway_sn` entspricht.

## Verzeichnisstruktur

```text
apps/
  control-api/       öffentliche und interne FH2-API
  web/               React-Weboberfläche

packages/
  aircraft-core/     SDK-neutrale Domäne und Safety
  adapters/
    dji-cloud/       DJI Cloud API / MQTT
    ugcs/            UgCS-Groundstation-Adapter

services/
  ugcs-bridge/       UCS/Java-Bridge

infra/
  emqx/              Broker-Autorisierung und ACL

docs/                verbindliche Projektdokumentation
```

## Entwicklung

Voraussetzung für die Node.js-Workspaces:

```text
Node.js >= 22
npm 11
```

Grundlegende lokale Prüfungen:

```bash
npm install
npm run build
npm run typecheck
npm test
```

Der vollständige V3-Gesamtstart ist als Release-Gate automatisiert:
Root-Compose, EMQX, TimescaleDB, Control API und Weboberfläche müssen
gemeinsam reproduzierbar starten und `scripts/verify.sh` bestehen.

## Dokumentation

Zentraler Einstieg:

- [vollständige Dokumentationsübersicht](docs/README.md)

Wichtige Kernunterlagen:

- [V3-Zielarchitektur](docs/V3_ARCHITECTURE.md)
- [Gesamtarchitektur](docs/ARCHITECTURE.md)
- [Sicherheitsmodell](docs/SICHERHEIT.md)
- [DJI-MQTT-Sicherheit](docs/DJI_MQTT_SECURITY.md)
- [Datenmodell](docs/DATENMODELL.md)
- [Persistenz](docs/PERSISTENZ.md)
- [API-Referenz](docs/API.md)
- [Betrieb und Konfiguration](docs/BETRIEB.md)
- [Tests und V3-Abnahme](docs/TESTS_UND_ABNAHME.md)
- [Aktueller Release-Status](docs/RELEASE_STATUS.md)
- [Changelog](CHANGELOG.md)

Fachunterlagen zu RC Pro, DRC, RTK, Missionen, Medien/Multispektral, UgCS und
Kompatibilität sind über den Dokumentationsindex verlinkt.

## Projektsteuerung

Für V3 gilt ein Feature-Freeze. Manager, RC Pro, Multispektral und DJI-MQTT
arbeiten ausschließlich an den Release-Gates.

Nur der **Direktor** startet und bewertet die zentrale CI.

Nach erfolgreicher Freigabe von V3.0 ist das Projekt abgeschlossen:

```text
V3.0 fertig -> Issues schließen -> main einfrieren -> Feierabend
```

Eine V3.1 oder weitere Entwicklung beginnt nur nach einem neuen ausdrücklichen
Auftrag des Projektinhabers.
