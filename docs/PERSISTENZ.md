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
- TimescaleDB-Hypertable `telemetry`
- kontinuierliches Minutenaggregat `telemetry_1m`
- MissionStore in der Control API
- Öffnen und Schließen automatisch erkannter Missionssitzungen
- optionale sichere RTK-Quellenmetadaten
- Recovery offener automatischer Missionen bei Dienstneustart mit `service_restart`
- separater TimescaleDB-Compose-Unterstack mit gepinntem Image `timescale/timescaledb:2.30.1-pg16`

### Noch offen für V3

- vollständiges Schreiben der normalisierten Telemetrie in `telemetry`
- vollständiges Wiederaufbauen der übrigen Runtime-Registries nach Neustart
- Persistenz von Topologie, AuthN/AuthZ-Audit und Medien
- Migrations-/Upgrade-Ablauf im finalen Root-Compose
- lokale Restart-/Retention-Abnahme

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

Die Control API aktiviert den MissionStore, wenn gesetzt:

```env
TIMESCALE_URL=postgresql://...
```

Ohne `TIMESCALE_URL` bleibt die Missionspersistenz deaktiviert.

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

Das aktuelle SQL-Schema bildet fachlich ausgewählte Telemetriefelder ab.

Die V3-Architektur verlangt zusätzlich, dass unveränderte Rohmeldungen
verlustfrei erhalten werden. Dafür ist vor V3-RC noch ein persistenter
Raw-Message-Pfad zu ergänzen oder verbindlich zu entscheiden.

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
- Telemetrie-Writer implementiert und getestet
- Retention funktioniert
- Aggregat wird aktualisiert
- keine Secrets in Missions-/Telemetriedaten
- Backup-/Restore-Verhalten dokumentiert
- Root-Compose startet Datenbank und Migration reproduzierbar
