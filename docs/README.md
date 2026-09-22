# FH-Clone – Dokumentationsübersicht

Diese Datei ist der verbindliche Einstieg in die FH2-V3-Dokumentation.

Alle erklärenden Projektunterlagen werden auf Deutsch geführt. Technische
Bezeichner wie API-Pfade, MQTT-Topics, JSON-Felder, Umgebungsvariablen,
Klassen- und Methodennamen bleiben unverändert, damit Dokumentation, Code und
Herstellerunterlagen eindeutig vergleichbar bleiben.

## Statuskennzeichnung

Jede technische Aussage soll einem dieser Zustände zuordenbar sein:

- **Implementiert** – auf `main` im Code vorhanden.
- **V3-Ziel** – für V3.0 verbindlich, aber noch nicht vollständig umgesetzt
  oder abgenommen.
- **Real zu verifizieren** – Verhalten muss mit echter DJI-Hardware oder dem
  tatsächlich eingesetzten Fremdsystem bestätigt werden.

Eine Zielarchitektur ist kein bestandener Laufzeit- oder Hardwaretest.

## Zentrale Unterlagen

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [V3_ARCHITECTURE.md](V3_ARCHITECTURE.md) | V3-Zielbild, Release-Gates, Projektabschluss | V3-Ziel |
| [ARCHITECTURE.md](ARCHITECTURE.md) | SDK-neutrale Gesamtarchitektur | Implementiert/V3-Ziel |
| [API.md](API.md) | öffentliche und interne HTTP-Endpunkte | Implementiert/V3-Ziel |
| [DATENMODELL.md](DATENMODELL.md) | Core-Datenmodell und Persistenzgrenzen | Implementiert/V3-Ziel |
| [SICHERHEIT.md](SICHERHEIT.md) | Safety, Trust Boundaries, Control Lease, Kill Switch | Implementiert/V3-Ziel |
| [KONFIGURATION.md](KONFIGURATION.md) | Umgebungsvariablen und Secrets | Implementiert/V3-Ziel |
| [BETRIEB.md](BETRIEB.md) | lokaler Betrieb und V3-Zielbetrieb | Implementiert/V3-Ziel |
| [FEHLERSUCHE.md](FEHLERSUCHE.md) | strukturierte Diagnose | Implementiert |
| [TESTS_UND_ABNAHME.md](TESTS_UND_ABNAHME.md) | lokale Tests, Hardware-Gates, Direktor-CI | V3-Ziel |
| [GLOSSAR.md](GLOSSAR.md) | zentrale Fachbegriffe | Referenz |

## DJI, MQTT und Steuerung

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [DJI_MQTT_SECURITY.md](DJI_MQTT_SECURITY.md) | Gateway-Identität, AuthN/AuthZ, Basic Link | V3-Ziel |
| [EMQX-AUTHZ.md](EMQX-AUTHZ.md) | Broker-Autorisierung und interne API | Implementiert/V3-Ziel |
| [RC_PRO.md](RC_PRO.md) | Gateway-/Aircraft-Modell und Hardwareprüfungen | teilweise real zu verifizieren |
| [DRC.md](DRC.md) | DRC-Protokoll, Sitzungsmaschine, Dead-Man | implementiert, standardmäßig gesperrt |
| [COMPATIBILITY.md](COMPATIBILITY.md) | DJI-SDK- und Produktstände | verifizierte Referenz |

Komponentenbezogen:

- [EMQX-Komponente](../infra/emqx/README.md)
- [Control API](../apps/control-api/README.md)

## Flug, RTK, Missionen und Medien

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [RTK_NTRIP.md](RTK_NTRIP.md) | RTK/GNSS und NTRIP-Zuständigkeitsgrenze | Implementiert |
| [MISSIONEN.md](MISSIONEN.md) | automatische Flugsitzungen und Korrelation | Implementiert/V3-Ziel |
| [PERSISTENZ.md](PERSISTENZ.md) | TimescaleDB, Retention, Missionsspeicher | Implementiert/V3-Ziel |
| [MEDIEN_MULTISPEKTRAL.md](MEDIEN_MULTISPEKTRAL.md) | Medien-, Sensor-, Band- und NDVI-Vertrag | V3-Ziel |

Datenbankkomponente:

- [TimescaleDB-Komponente](../infra/timescale/README.md)

## UgCS

- [TypeScript-UgCS-Adapter](../packages/adapters/ugcs/README.md)
- [UgCS-UCS-Bridge](../services/ugcs-bridge/README.md)

UgCS bleibt ein optionaler Bodenstationsadapter und darf den zentralen
Command-, Authority- oder Safety-Pfad nicht umgehen.

## Abgleich zum stabilen Manager-Pfad

[FH2_MANAGER_ALIGNMENT.md](FH2_MANAGER_ALIGNMENT.md) beschreibt die
Abgrenzung zum eingefrorenen M4-Cloud-/FH2-Manager-Referenzstand.

## Verantwortlichkeiten bis V3.0

### Manager

- Gesamtstart und Deployment
- TimescaleDB-/PostgreSQL-Persistenz
- Health/Readiness
- lokale Verify-Suite
- öffentliche Lese-API
- Integration bestätigter Fachverträge

### RC Pro

- reale MQTT-Client-ID und Credential-Semantik
- `update_topo`
- Gateway-/Aircraft-Topic-Matrix
- Reconnect und Pair/Unpair
- reale Capability-Matrix

### Multispektral

- Feld-/Quellenmatrix
- Sensor-/Bandidentität
- Media-Korrelation
- NDVI-Validierung
- reale Hardware-Testfälle

### DJI-MQTT

- AuthN-Vertrag
- AuthZ-Vertrag
- Gateway-Credential-Lebenszyklus
- Basic-Link-ACL
- DRC-Sitzungsisolation
- Audit

### Direktor

- Architekturkonvergenz
- Release-Gates
- finale zentrale CI
- V3.0-Freigabe und anschließender Projektstopp

## Dokumentationsregeln

1. Erklärtexte sind deutsch.
2. Keine erfundenen DJI-Felder, Endpunkte oder Fähigkeiten.
3. Herstellerwerte werden belegt oder als noch zu verifizieren gekennzeichnet.
4. Implementierungsstand und Zielzustand werden getrennt.
5. Secrets erscheinen weder real noch beispielhaft im Klartext.
6. Sicherheitsrelevante Standardwerte werden ausdrücklich genannt.
7. Jede V3-Codeänderung mit Außenwirkung aktualisiert gleichzeitig die
   zugehörige deutsche Dokumentation.
8. Es gibt pro Thema genau eine kanonische Fachseite; Doppelstände werden
   entfernt.
9. V3.0 ist der Abschlussstand. Danach endet die Entwicklung ohne neuen
   ausdrücklichen Auftrag.
