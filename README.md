# FH-Clone – FH2 V3.0

FH-Clone ist die modulare, lokale Integrationsplattform für DJI-Enterprise-
Fluggeräte, FlightHub-2-nahe Funktionen, DJI Cloud API, RTK, Medien,
Multispektral-Verarbeitung und Groundstation-Anbindung.

Der aktuelle Stand auf `main` ist **V3-Entwicklung**. Die Versionsnummer
`3.0.0` wird erst gesetzt, wenn alle V3-Release-Gates erfüllt und vom
Direktor freigegeben wurden.

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

Noch nicht als V3 freigegeben sind insbesondere:

- finaler Root-Compose-Gesamtstack
- vollständige TimescaleDB-/PostgreSQL-Persistenz
- endgültige EMQX-Authentifizierung mit Gateway-Credential-Bindung
- reale RC-Pro-Verifikation des MQTT-Sitzungsverhaltens
- finaler Multispektral-/Media-Vertrag
- finale lokale Abnahme und Direktor-CI

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

Der vollständige V3-Gesamtstart wird erst als Release-Gate freigegeben, wenn
Root-Compose, EMQX, TimescaleDB, Control API und Weboberfläche gemeinsam
reproduzierbar starten.

## Dokumentation

Der verbindliche Einstiegspunkt ist
[docs/README.md](docs/README.md).

Kernunterlagen:

- [V3-Zielarchitektur](docs/V3_ARCHITECTURE.md)
- [Gesamtarchitektur](docs/ARCHITECTURE.md)
- [API-Referenz](docs/API.md)
- [Konfiguration](docs/KONFIGURATION.md)
- [Betrieb](docs/BETRIEB.md)
- [Fehlersuche](docs/FEHLERSUCHE.md)
- [Tests und V3-Abnahme](docs/TESTS_UND_ABNAHME.md)
- [Sicherheitsmodell](docs/SICHERHEIT.md)
- [DJI-MQTT-Sicherheit](docs/DJI_MQTT_SECURITY.md)
- [EMQX-Authentifizierung und -Autorisierung](docs/EMQX-AUTHZ.md)
- [RC Pro Enterprise](docs/RC_PRO.md)
- [DRC](docs/DRC.md)
- [RTK und NTRIP](docs/RTK_NTRIP.md)
- [Missionen und Flugsitzungen](docs/MISSIONEN.md)
- [Persistenz mit TimescaleDB](docs/PERSISTENZ.md)
- [Datenmodell](docs/DATENMODELL.md)
- [Medien und Multispektral](docs/MEDIEN_MULTISPEKTRAL.md)
- [Kompatibilität](docs/COMPATIBILITY.md)
- [FH2-/M4-Abgleich](docs/FH2_MANAGER_ALIGNMENT.md)
- [Glossar](docs/GLOSSAR.md)

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
