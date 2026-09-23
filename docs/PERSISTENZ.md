# Persistenz mit TimescaleDB/PostgreSQL

## Zweck

V3 verwendet TimescaleDB auf PostgreSQL-Basis für langlebige Missions- und
Telemetriedaten.

Das Datenmodell trennt kleine relationale Metadaten von hochfrequenter
Zeitreihentelemetrie.

## Status

### Implementiert

- SQL-Grundschema unter `infra/timescale/sql/001_schema.sql`
- Tabelle `missions`
- TimescaleDB-Hypertable `telemetry` für die missionsbezogene Flugprojektion
- TimescaleDB-Hypertable `raw_messages` für sanitierte Adapter-Rohmeldungen
- TimescaleDB-Hypertable `normalized_parameters` für vollständige normalisierte Parameterhistorie mit Adapter-Provenienz
- kontinuierliches Minutenaggregat `telemetry_1m`
- MissionStore und TelemetryStore in der Control API
- Öffnen und Schließen automatisch erkannter Missionssitzungen
- optionale sichere RTK-Quellenmetadaten
- Recovery offener automatischer Missionen bei Dienstneustart mit `service_restart`
- Persistenz von Gateway-Topologie, AuthN/AuthZ-Audit und MediaAssets
- idempotenter Migrations-/Upgrade-Pfad im Root-Compose
- separater TimescaleDB-Compose-Unterstack mit gepinntem Image `timescale/timescaledb:2.30.1-pg16`

### Noch offen als Betriebs-/Historienausbau

- dokumentierter Backup-/Restore-Ablauf für die vollständige Datenbank
- Last-/Kapazitätsmessung der 24-Monats-Retention mit realistischen Telemetrieraten
- optionale öffentliche Historien-API; die Persistenz selbst benötigt dafür keinen Schreibendpunkt
- vollständige Rehydrierung aller nicht-autorisierenden Inventar-/Analyse-Registries ist nur bei konkretem Bedarf sinnvoll; Control-Rechte bleiben absichtlich runtime-only

## Datenbank-Unterstack

Vorhanden:

```text
infra/timescale/compose.yaml
infra/timescale/.env.example
infra/timescale/sql/001_schema.sql
```

Der Container veröffentlicht Port 5432 nicht auf den Host, sondern verwendet
`expose` für die interne Stack-Kommunikation.

Details: [TimescaleDB-Komponente](../infra/timescale/README.md).

## Verbindung

Die Control API aktiviert MissionStore, MediaStore und TelemetryStore, wenn gesetzt:

```env
TIMESCALE_URL=postgresql://...
```

Ohne `TIMESCALE_URL` bleiben diese Historienpfade deaktiviert; die Live-Registries arbeiten weiter in-memory.

Optionale nicht-sensitive RTK-Metadaten:

```env
RTK_SOURCE_LABEL=SAPOS BW
RTK_SOURCE_PROVIDER=Landesdienst
```

NTRIP-Zugangsdaten werden nicht gespeichert.

## Tabelle missions

Wichtige Felder:

```text
mission_id
source
gateway_sn
drone_sn
product_domain
device_type
device_sub_type
started_at
ended_at
end_reason
pilot
rtk_source_label
rtk_provider
rtk_configured_via
notes
created_at
```

Die Mission-ID ist ein UUID-Primärschlüssel.

## Telemetrie-Hypertable

`telemetry` ist als TimescaleDB-Hypertable vorgesehen.

Enthaltene Kategorien:

- Zeit und Mission
- Drone-SN
- Position
- Ellipsoidhöhe
- relative Höhe
- horizontale/vertikale Geschwindigkeit
- Aircraft-Attitude
- RTK/GNSS
- Betriebsmodus
- Batterie
- Gimbal
- Kamera-State

Die Tabelle referenziert `missions(mission_id)`.

## Chunking und Retention

Aktuelles Schema:

```text
Chunk-Intervall: 1 Tag
Columnstore-Policy: nach 7 Tagen
Rohtelemetrie-Retention: 24 Monate
```

Diese Werte sind Betriebsrichtlinien von FH2 und keine DJI-Vorgaben.

Vor V3-Freigabe müssen Speicherbedarf und gewünschte Historie gegen den realen
Betrieb geprüft werden.

## Minutenaggregat

`telemetry_1m` fasst Telemetrie pro Minute, Mission und Aircraft zusammen.

Beispiele:

- mittlere Position
- mittlere Höhen/Geschwindigkeiten
- minimale/maximale Batterie
- mittlere Satellitenzahlen
- Anzahl der RTK-Fixzustände
- mittlere Heading-/Gimbal-Werte

Das Aggregat soll historische Auswertung ermöglichen, auch wenn alte
Rohtelemetrie später aus der Retention fällt.

## Rohdaten vs. normalisierte Telemetrie

Die Persistenz besitzt drei getrennte Ebenen:

```text
raw_messages
  = sanitierte Hersteller-/Adapter-Rohmeldung als JSONB

normalized_parameters
  = vollständige ParameterSample-Historie
  = device + adapter + key + rawKey + value + quality + timestamp

telemetry
  = missionsbezogene, typisierte Projektion ausgewählter Flug-/RTK-Werte
  -> telemetry_1m
```

DJI-Cloud- und MSDK-V5-Werte bleiben in `normalized_parameters` getrennt nach
`adapter_id`. Die Runtime-Fusion in der `ParameterRegistry` entscheidet nur
über die aktuelle Sicht; sie ersetzt die persistierte Adapter-Provenienz nicht.

Die Projektion nach `telemetry` wird ausschließlich während einer bekannten
Mission geschrieben. Unbekannte oder nicht abbildbare kanonische Keys gehen
dadurch nicht verloren, weil sie weiterhin vollständig in
`normalized_parameters` liegen.

Vor dem Schreiben werden Raw-Payloads und Parameterwerte auf
credential-/secret-artige Felder und unredigierte Bearer-Werte geprüft.
Runtime-Control-Rechte, Leases und DRC-Sessions werden nicht persistiert.

## MissionStore

Der `MissionStore`:

- öffnet eine Mission beim automatischen Sitzungsstart
- speichert Produktidentität aus der Topologie, soweit vorhanden
- schließt die Mission mit Endzeit und Endgrund
- markiert beim Service-Neustart noch offene automatische Missionen mit
  `end_reason = service_restart`, statt sie automatisch wieder als aktiv zu behandeln
- kann die Datenbankverbindung prüfen
- schließt den Connection Pool beim Prozessende

## Sicherheit

Nicht in der Missions-/Telemetrie-Datenbank speichern:

- MQTT-Passwörter
- EMQX-Service-Tokens
- NTRIP-Passwörter
- DRC-Relay-Credentials

AuthN/AuthZ-Credentials benötigen einen getrennten, entsprechend geschützten
Credential-Speicher mit Passwort-Hashes.

## V3-Abnahme

- Schema reproduzierbar initialisierbar
- abgeschlossene Missionshistorie über Neustart hinweg vorhanden
- offene automatische Missionen werden beim Neustart sicher mit `service_restart` abgeschlossen
- Telemetrie-Writer für Raw-Messages und normalisierte Parameter implementiert und getestet
- missionsbezogene `telemetry`-Projektion aus dem fusionierten kanonischen Sample
- Migration `007_telemetry_history.sql` ist idempotent und im Upgrade-Pfad enthalten
- `/ready` prüft konfigurierte Telemetriepersistenz fail-closed
- 24-Monats-Retention für Raw-Messages und normalisierte Parameter ist im Schema definiert
- `telemetry_1m` bleibt als missionsbezogenes Analyseaggregat erhalten
- keine Secrets in Missions-/Telemetriedaten
- Root-Compose startet Datenbank und Migration reproduzierbar
- Backup-/Restore und Kapazitätsplanung bleiben Betriebsaufgaben
