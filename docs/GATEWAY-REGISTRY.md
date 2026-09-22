# Persistente DJI Gateway-Registry

## Ziel

FH-Clone persistiert die zuletzt beobachtete DJI-Gateway-Topologie für
Inventar, UI und Diagnose:

```text
RC Pro Enterprise / RC Plus 2
        |
        +-- Aircraft / Sub-Device
```

Die Persistenz ist **nicht** die Autorisierungsquelle des EMQX-HTTP-Authorizers.

## Sicherheitsregel

Nach einem Control-API-Neustart gilt:

```text
PostgreSQL-Eintrag != aktive MQTT-Autorisierung
```

Die dynamische Autorisierung verwendet weiterhin ausschließlich die
In-Memory-`DjiTopologyRegistry`, die durch ein **frisches**
`update_topo` derselben Laufzeit gefüllt wird.

Damit kann eine alte Datenbankzuordnung nach einem Aircraft-/RC-Wechsel keine
veraltete MQTT-Berechtigung reaktivieren.

## PostgreSQL-Schema

Migration:

```text
infra/postgres/migrations/001_dji_gateway_registry.sql
```

Tabellen:

- `dji_gateways`
- `dji_gateway_devices`

Die Device-Tabelle enthält einen aktuellen/zuletzt bekannten Mapping-Status
über `active` und `removed_at`.

## Keine DJI-Secrets

Nicht gespeichert werden:

- `device_secret`
- `nonce`
- MQTT-Passwörter
- EMQX-Authorizer-Token

Zusätzlich sanitisiert der DJI-Adapter `update_topo` vor
`onRawMessage`. Dadurch enthält auch `LOG_RAW_DJI=1` keine
Topology-Secrets.

## Aktivierung

Schema einmal anwenden:

```bash
psql "$DATABASE_URL" -f infra/postgres/migrations/001_dji_gateway_registry.sql
```

Control API:

```env
DATABASE_URL=postgresql://fhclone:...@postgres:5432/fhclone
```

Wenn `DATABASE_URL` nicht gesetzt ist, läuft FH-Clone unverändert nur mit
der Runtime-Registry.

Wenn `DATABASE_URL` gesetzt ist, aber die Migration fehlt, startet die
Control API absichtlich nicht erfolgreich. Damit wird eine halbfertige
Persistenzkonfiguration sichtbar statt still ignoriert.

## API

Aktive Laufzeit-Topologie:

```text
GET /api/dji/topology
```

Persistiertes Inventar:

```text
GET /api/dji/topology/persisted
```

Die persistierte Antwort markiert ausdrücklich:

```json
{
  "authorizationSource": "runtime-update_topo",
  "persistedInventoryOnly": true
}
```

Dadurch darf die WebUI einen DB-Eintrag nicht mit einer aktuell
steuerberechtigten Verbindung verwechseln.

## Schreibverhalten

Bei jedem `update_topo`:

1. Gateway wird upserted.
2. bisher aktive Sub-Devices dieses Gateways werden inaktiv markiert.
3. aktuell gemeldete Sub-Devices werden upserted und aktiv gesetzt.
4. ein Device, das zu einem anderen Gateway wechselt, erhält die neue
   `gateway_sn`.

Ein Persistenzfehler stoppt den Live-DJI-Adapter nicht. Er wird geloggt; die
Runtime-Registry und damit das Fail-closed-AuthZ-Modell bleiben funktionsfähig.

## Nächster Schritt

Nach dieser Registry-Persistenz kann das AuthZ-Audit-Logging ebenfalls in
PostgreSQL geschrieben und mit Gateway-/Device-IDs korreliert werden.
