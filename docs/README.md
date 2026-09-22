# FH-Clone Dokumentation

Diese Übersicht ist der verbindliche Einstieg in die V3-Dokumentation.

Alle erklärenden Projektdokumente werden auf Deutsch geführt. Technische
Protokollnamen, API-Pfade, MQTT-Topics, JSON-Felder, Klassen- und
Quellcode-Bezeichner bleiben unverändert, damit Dokumentation, Code und
Herstellerunterlagen direkt vergleichbar bleiben.

## Statuskennzeichnung

Die Dokumentation unterscheidet drei Zustände:

- **Implementiert** – auf `main` vorhanden.
- **V3-Ziel** – für V3.0 verbindlich, aber noch nicht vollständig umgesetzt.
- **Real zu verifizieren** – Hardware- oder Herstellerverhalten muss noch mit
  echter DJI-Hardware bestätigt werden.

Zielarchitektur darf nicht als bereits bestandene Laufzeit- oder
Hardwareabnahme missverstanden werden.

## Architektur und Datenmodell

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [V3_ARCHITECTURE.md](V3_ARCHITECTURE.md) | verbindliches V3-Zielbild und Release-Gates | V3-Ziel |
| [ARCHITECTURE.md](ARCHITECTURE.md) | SDK-neutrale Gesamtarchitektur | Implementiert/V3-Ziel |
| [SICHERHEIT.md](SICHERHEIT.md) | übergreifendes Safety-/Security-Modell | Implementiert/V3-Ziel |
| [DATENMODELL.md](DATENMODELL.md) | Core-Typen und fachliches Persistenzmodell | Implementiert/V3-Ziel |
| [PERSISTENZ.md](PERSISTENZ.md) | TimescaleDB/PostgreSQL, Retention und MissionStore | Implementiert/V3-Ziel |

## DJI, MQTT und Fluggeräte

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [DJI_MQTT_SECURITY.md](DJI_MQTT_SECURITY.md) | MQTT-Identität, AuthN/AuthZ und Basic-Link-/DRC-Trennung | V3-Ziel |
| [EMQX-AUTHZ.md](EMQX-AUTHZ.md) | EMQX-Vertrag und interne Auth-Endpunkte | Implementiert/V3-Ziel |
| [RC_PRO.md](RC_PRO.md) | Gateway-/Aircraft-Modell und reale RC-Pro-Prüfpunkte | Real zu verifizieren |
| [DRC.md](DRC.md) | DRC, DJI Authority, Dead-Man und Sitzungszustände | Implementiert, standardmäßig gesperrt |
| [RTK_NTRIP.md](RTK_NTRIP.md) | RTK-/GNSS-Telemetrie und NTRIP-Zuständigkeitsgrenze | Implementiert |
| [COMPATIBILITY.md](COMPATIBILITY.md) | DJI-SDK- und Produktstände | Referenz |
| [DJI_CAPABILITY_MATRIX.md](DJI_CAPABILITY_MATRIX.md) | DJI-Produkt-/Funktionsmatrix und FH2-Freigaben | Implementiert/Referenz |

## Missionen, Medien und Verarbeitung

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [MISSIONEN.md](MISSIONEN.md) | automatische Flugsitzungen und Missionskorrelation | Implementiert/V3-Ziel |
| [MEDIEN_MULTISPEKTRAL.md](MEDIEN_MULTISPEKTRAL.md) | Medien-, Sensor-, Band- und NDVI-Vertrag | V3-Ziel |
| [FH2_MANAGER_ALIGNMENT.md](FH2_MANAGER_ALIGNMENT.md) | Abgrenzung zum stabilen M4-/FH2-Manager-Pfad | Referenz |
| [FH2_STANDALONE_FRONTEND.md](FH2_STANDALONE_FRONTEND.md) | offizielle DJI Project Map, Wayline, Flight Path, Virtual Cockpit und `window.FH2` | Implementiert |

## Betrieb und Entwicklung

| Dokument | Inhalt |
| --- | --- |
| [API.md](API.md) | öffentliche und interne HTTP-Endpunkte |
| [BETRIEB.md](BETRIEB.md) | lokaler Betrieb und V3-Zielbetrieb |
| [KONFIGURATION.md](KONFIGURATION.md) | Umgebungsvariablen und Secrets |
| [FEHLERSUCHE.md](FEHLERSUCHE.md) | systematische Diagnose |
| [TESTS_UND_ABNAHME.md](TESTS_UND_ABNAHME.md) | Teststand und V3-Release-Gates |
| [RELEASE_STATUS.md](RELEASE_STATUS.md) | aktueller V3-Release-Status und offene Gates |
| [GLOSSAR.md](GLOSSAR.md) | zentrale Begriffe und Abkürzungen |

## Komponentenunterlagen

| Dokument | Inhalt |
| --- | --- |
| [../apps/control-api/README.md](../apps/control-api/README.md) | Control API, Ports, Endpunkte und Laufzeit |
| [../infra/emqx/README.md](../infra/emqx/README.md) | EMQX-Rollen, ACL und Broker-Grenzen |
| [../infra/timescale/README.md](../infra/timescale/README.md) | TimescaleDB-Schema und Datenbankbetrieb |
| [../packages/adapters/ugcs/README.md](../packages/adapters/ugcs/README.md) | TypeScript-UgCS-Adapter |
| [../services/ugcs-bridge/README.md](../services/ugcs-bridge/README.md) | Java/UCS-Bridge |

## Verantwortungsbereiche für V3

### Manager

- Gesamtstart und Deployment
- Health/Readiness
- TimescaleDB/PostgreSQL
- lokale Verify-Suite
- öffentliche API
- Integration bestätigter Fachverträge

### RC Pro

- reale MQTT-Client-ID
- Credential-Semantik
- `update_topo`
- Gateway- vs. Aircraft-Topics
- Reconnect und Pair/Unpair
- Produkt-/Capability-Matrix

### Multispektral

- Feld-/Quellenmatrix
- Sensor-/Band-Identität
- Media-Korrelation
- ProcessingProfile
- M3M-/NDVI-Testfälle

### DJI-MQTT

- HTTP AuthN/AuthZ
- Gateway-Credential-Lifecycle
- trusted `gateway_sn`
- Default-Deny
- DRC-Sitzungsisolation
- Audit

## Dokumentationsregeln

1. Deutsche Erklärungstexte.
2. Keine erfundenen DJI-Felder, Produktfähigkeiten oder Endpunkte.
3. Herstellerwerte mit Quelle oder als zu verifizieren kennzeichnen.
4. Implementierten Stand und Zielarchitektur trennen.
5. Secrets niemals in Beispiele übernehmen.
6. Sicherheitsrelevante Standardwerte ausdrücklich nennen.
7. Technische Originalbezeichner nicht übersetzen, wenn dies den
   Protokollabgleich erschweren würde.
8. V3.0 ist der Abschlussstand; danach keine Folgeplanung ohne neuen Auftrag.
