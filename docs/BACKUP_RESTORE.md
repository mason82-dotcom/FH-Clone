# TimescaleDB Backup und Restore

## Ziel

FH2 sichert die vollständige persistente Datenbank, ohne Runtime-Control-
Zustände als wiederherstellbare Autorisierungsquelle einzuführen.

Gesichert werden unter anderem:

- Missionen und missionsbezogene Telemetrie,
- sanitierte Raw-Messages und normalisierte Parameterhistorie,
- MediaAssets,
- Gateway-Inventar,
- Gateway-Credential-Hashes,
- MSDK-Token-Revocations,
- AuthZ-Audit,
- passive, sanitierte MQTT-Outbound-Evidence.

Nicht Bestandteil des Persistenzmodells sind aktive FC-Stufe, Control Lease,
DJI Control Authority, aktive DRC-Sitzungen oder andere flüchtige
Flugsteuerrechte.

## Backup

Voraussetzungen:

- der Compose-Stack läuft,
- die Datenbank ist healthy,
- die lokale `.env` enthält die passende produktive Konfiguration.

Beispiel:

```bash
mkdir -p ~/fh2-backups
sh scripts/backup-timescale.sh \
  ~/fh2-backups/fh2-$(date +%Y%m%d-%H%M%S).dump
```

Der Dump wird im PostgreSQL-Custom-Format erzeugt. Das Skript verwendet
`umask 077` und setzt die erzeugte Datei auf nur für den aktuellen Benutzer
lesbar/schreibbar. Backups können Credential-Hashes, Geräteinventar,
Positions-/Telemetriehistorie und weitere betriebliche Daten enthalten und
sind entsprechend vertraulich zu behandeln.

## Restore in eine separate Datenbank

Ein Restore überschreibt die aktive Datenbank standardmäßig **nicht**.

Beispiel:

```bash
FH2_RESTORE_DATABASE=fhclone_restore_20260930 \
  sh scripts/restore-timescale.sh ~/fh2-backups/fh2-20260930.dump
```

Existiert die Zieldatenbank bereits, bricht das Skript ab. Ein bewusstes
Ersetzen erfordert zusätzlich:

```bash
FH2_RESTORE_REPLACE=YES
```

Nach dem Restore werden TimescaleDB-Pre-/Post-Restore-Hooks ausgeführt und das
FH2-Pflichtschema validiert.

## In-Place-Recovery

Ein Restore direkt nach `fhclone` ist eine Wartungsoperation. Er darf nur
mit gestoppter Control API/EMQX-Schreiblast und einem vorher verifizierten
Backup durchgeführt werden.

Das Skript sperrt diesen Pfad standardmäßig. Für einen bewusst geplanten
Recovery-Lauf sind beide expliziten Flags erforderlich:

```bash
FH2_RESTORE_DATABASE=fhclone \
FH2_ALLOW_INPLACE_RESTORE=YES \
FH2_RESTORE_REPLACE=YES \
  sh scripts/restore-timescale.sh /sicherer/pfad/fh2.dump
```

Nach einem In-Place-Restore müssen Control API und EMQX neu gestartet und
`/health`, `/ready`, AuthN/AuthZ sowie die Runtime-Topologie erneut geprüft
werden. Persistiertes Gateway-Inventar darf dabei keine aktuelle
Runtime-Autorisierung erzeugen.

## Automatisches Gate

`scripts/test-timescale-backup-restore.sh` legt ausschließlich synthetische,
nicht-sensitive Marker in allen relevanten Persistenzklassen an, erstellt
einen echten Custom-Format-Dump, stellt ihn in eine frische Datenbank wieder
her und prüft:

1. Pflichtschema vollständig vorhanden,
2. repräsentative Daten aller Persistenzklassen erhalten,
3. deaktivierte Gateway-Credentials bleiben deaktiviert,
4. Revocations bleiben erhalten,
5. keine Tabellen für aktive DRC-Sessions, Control Leases, Authority oder
   FC-Stufe entstehen.

Dieses Gate läuft in der Direktor-CI im TimescaleDB-Job.
