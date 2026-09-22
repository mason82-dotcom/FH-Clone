# FH-Clone Dokumentation

Diese Übersicht ist der verbindliche Einstieg in die V3-Dokumentation.

Alle erklärenden Projektdokumente werden auf Deutsch geführt. Technische
Protokollnamen, API-Pfade, MQTT-Topics, JSON-Felder und Quellcode-Bezeichner
bleiben unverändert, damit die Dokumentation direkt mit Herstellerunterlagen
und Code vergleichbar bleibt.

## Statuskennzeichnung

Die Dokumentation unterscheidet drei Zustände:

- **Implementiert** – auf `main` vorhanden.
- **V3-Ziel** – für V3.0 verbindlich, aber noch nicht vollständig umgesetzt.
- **Real zu verifizieren** – Herstellervertrag oder Hardwareverhalten muss
  noch mit der echten DJI-Hardware bestätigt werden.

Diese Unterscheidung ist wichtig: Dokumentierte Zielarchitektur darf nicht als
bereits bestandene Hardware- oder Laufzeitabnahme missverstanden werden.

## Kernunterlagen

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [V3_ARCHITECTURE.md](V3_ARCHITECTURE.md) | verbindliches V3-Zielbild und Release-Gates | V3-Ziel |
| [ARCHITECTURE.md](ARCHITECTURE.md) | SDK-neutrale Kernarchitektur | Implementiert/V3-Ziel |
| [DJI_MQTT_SECURITY.md](DJI_MQTT_SECURITY.md) | MQTT-Identität, AuthN/AuthZ, Basic Link, DRC-Trennung | V3-Ziel |
| [EMQX-AUTHZ.md](EMQX-AUTHZ.md) | EMQX-Vertrag und interne Endpunkte | Implementiert/V3-Ziel |
| [RC_PRO.md](RC_PRO.md) | Gateway-/Aircraft-Modell und reale RC-Pro-Prüfpunkte | teilweise real zu verifizieren |
| [DRC.md](DRC.md) | DRC-Protokoll, Authority, Dead-Man und Safety | Implementiert, standardmäßig gesperrt |
| [RTK_NTRIP.md](RTK_NTRIP.md) | RTK-/GNSS-Telemetrie und NTRIP-Zuständigkeitsgrenze | Implementiert |
| [MULTISPEKTRAL.md](MULTISPEKTRAL.md) | Medien-, Sensor-, Band- und NDVI-Vertrag | V3-Ziel |
| [MISSIONEN.md](MISSIONEN.md) | automatische Flugsitzungen und Missionskorrelation | Implementiert/V3-Ziel |
| [PERSISTENZ.md](PERSISTENZ.md) | TimescaleDB/PostgreSQL, Retention und Missionsspeicher | Implementiert/V3-Ziel |
| [BETRIEB.md](BETRIEB.md) | lokaler Betrieb, Netzwerkgrenzen und Fehlersuche | Implementiert/V3-Ziel |
| [COMPATIBILITY.md](COMPATIBILITY.md) | DJI-SDK-/Produktstände | verifizierte Referenz |
| [FH2_MANAGER_ALIGNMENT.md](FH2_MANAGER_ALIGNMENT.md) | Abgrenzung zum stabilen M4-/FH2-Manager-Pfad | Referenz |

## Komponentenunterlagen

| Dokument | Inhalt |
| --- | --- |
| [../apps/control-api/README.md](../apps/control-api/README.md) | Control API, Ports, Endpunkte und Umgebungsvariablen |
| [../infra/emqx/README.md](../infra/emqx/README.md) | EMQX-Rollen, ACL und Betriebsgrenzen |
| [../packages/adapters/ugcs/README.md](../packages/adapters/ugcs/README.md) | TypeScript-UgCS-Adapter |
| [../services/ugcs-bridge/README.md](../services/ugcs-bridge/README.md) | Java/UCS-Bridge |

## V3-Fachbereiche

### Runtime und Manager

Der Manager verantwortet:

- Gesamtstart und Deployment
- Health/Readiness
- TimescaleDB-/PostgreSQL-Persistenz
- lokale Verify-Suite
- öffentliche Read-API
- Integration der bestätigten RC-Pro-, MQTT- und Multispektralverträge

### RC Pro

Zu bestätigen sind insbesondere:

- reale MQTT-Client-ID
- reale Credential-Semantik
- `update_topo`
- Gateway- vs. Aircraft-Topics
- Reconnect und Pair/Unpair
- Produkt-/Capability-Matrix

### Multispektral

Der V3-Vertrag umfasst:

```text
MediaAsset
SensorSource
SpectralBand
CaptureContext
ProcessingProfile
```

Pflichtprofile:

```text
GENERIC
RGB
THERMAL
MULTISPECTRAL
NDVI
```

Red und NIR müssen für `NDVI_READY` eindeutig und authoritative
identifiziert sein.

### DJI-MQTT

Verbindlich ist die Trennung:

```text
Basic Link
  !=
DRC Relay
```

Die MQTT-Client-ID ist keine Sicherheitsidentität.

## Dokumentationsregeln

1. Deutsche Erklärungstexte.
2. Keine erfundenen DJI-Felder oder Endpunkte.
3. Herstellerwerte mit Quelle oder als noch zu verifizieren kennzeichnen.
4. Tatsächlichen Implementierungsstand von Zielarchitektur trennen.
5. Secrets niemals in Beispiele übernehmen.
6. Sicherheitsrelevante Defaults ausdrücklich nennen.
7. V3.0 ist der Abschlussstand; nach Release keine Folgeplanung ohne neuen
   Auftrag.
