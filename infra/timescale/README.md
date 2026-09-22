# TimescaleDB – FH2-Telemetrie

FH-Clone verwendet TimescaleDB für persistente Flugtelemetrie und relationale Missionszuordnung.

## Version

Der Stack ist bewusst gepinnt auf:

```text
timescale/timescaledb:2.30.1-pg16
```

Kein `latest`-Tag im produktiven Compose.

## Start

```bash
cp .env.example .env
docker compose --env-file .env up -d
```

Die Datenbank wird nicht standardmäßig auf einen Host-Port veröffentlicht. Der Zugriff ist für den internen Stack gedacht.

## Schema

`sql/001_schema.sql` legt an:

- relationale Tabelle `missions`
- Hypertable `telemetry`
- 1-Tages-Chunks
- Hypercore/Columnstore mit Segmentierung nach `mission_id, drone_sn`
- Columnstore-Policy nach 7 Tagen
- Rohdaten-Retention nach 24 Monaten
- Continuous Aggregate `telemetry_1m`
- `002_rtk_fix_enum.sql` erzwingt für `is_fixed` ausschließlich `0/1/2/3` oder `NULL`
- `003_authz_audit.sql` legt den AuthZ-Audit-Hypertable, 24-Monats-Retention, Columnstore-Policy und die stündliche Deny-Aggregation an

## Produktkennung

DJI-Geräte werden nicht über erfundene Modellnummern persistiert. Die Felder entsprechen der Cloud-API-Topologie:

```text
product_domain
device_type
device_sub_type
```

Für die Mavic-3-Enterprise-Serie ist `device_type = 77`; M3E/M3T werden über `device_sub_type` unterschieden.

## Missionssitzungen

Automatische Sessions entstehen erst bei flugaktiven `mode_code`-Werten.

Nicht startend:

- 0 Standby
- 1 Startvorbereitung
- 2 Startvorbereitung abgeschlossen
- 13 Aktualisierung
- 14 Nicht verbunden

Beendigung:

- stabiler Standby-Zustand nach Grace-Periode
- oder 30 s ohne Telemetrie
- oder explizites späteres manuelles Ende

`mode_code = 0` wird bewusst als **Standby** behandelt, nicht pauschal als semantisches „Gelandet“-Ereignis.

## RTK

Persistiert werden nur Statuswerte wie:

- `is_fixed`
- `quality`
- `gps_number`
- `rtk_number`
- `mode_code`

`is_fixed` ist ausdrücklich das DJI-Vier-Zustands-Enum:

```text
0 = not started
1 = fixing
2 = fixed successfully
3 = fixing failed
```

`quality` bleibt davon getrennt; `quality = 10` kennzeichnet RTK-Fix-Qualität.

NTRIP Host, Port, Mountpoint, Benutzername und Passwort werden nicht gespeichert.

Optional können sichere Metadaten gesetzt werden:

```text
RTK_SOURCE_LABEL=SAPOS BW
RTK_SOURCE_PROVIDER=Landesdienst
```

## Control API

Wenn Persistenz aktiviert werden soll:

```text
TIMESCALE_URL=postgres://fhclone:<passwort>@timescaledb:5432/fhclone
```

Ohne `TIMESCALE_URL` arbeitet die Live-Telemetrie vollständig ohne Datenbank weiter.


## Weiterführende Dokumentation

- [Persistenz](../../docs/PERSISTENZ.md)
- [Datenmodell](../../docs/DATENMODELL.md)
- [Missionen](../../docs/MISSIONEN.md)
- [RTK und NTRIP](../../docs/RTK_NTRIP.md)
- [Betrieb](../../docs/BETRIEB.md)


## AuthZ-Audit

Der HTTP-Authorizer schreibt **nicht synchron** nach TimescaleDB. Entscheidungen
gehen zuerst in einen In-Memory-Ringbuffer (10.000 Einträge) und werden in
Batches von bis zu 500 Zeilen bzw. alle 2 Sekunden geschrieben.

Alle Entscheidungen werden zusätzlich als JSONL nach stdout ausgegeben.
TimescaleDB speichert:

- alle `deny`
- alle `ignore`
- `allow` nur für `drc/*`, `services` und `property/set`

Die persistierte Topologie und das Audit sind reine Inventar-/Analyse-Senken.
Sie dürfen niemals zur Runtime-Autorisierungsquelle werden.

Ein EMQX-Cache-Hit erreicht den HTTP-Hook nicht. Daher tragen tatsächlich
eingegangene Hook-Aufrufe `cache_hit=false`; die echte Cache-Hit-Rate muss
aus EMQX-Metriken stammen.
