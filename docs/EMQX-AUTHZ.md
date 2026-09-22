# EMQX – Authentifizierung und Autorisierung

## Zweck

EMQX ist der MQTT-Broker für den DJI-Basic-Link und interne FH2-Dienste.

Die Sicherheitsarchitektur verwendet mehrere Schutzschichten:

```text
MQTT Client
   |
   v
EMQX AuthN
   |
   v
HTTP AuthZ
   |
   +-- allow / deny
   |
   +-- ignore -> Datei-ACL
                    |
                    +-- kein Treffer -> DENY
```

## Status

### Implementiert

- `POST /internal/emqx/authz`
- Datei-ACL
- Default-Deny
- interner AuthZ-Service-Token
- Topologie-basierte Sub-Device-Prüfung
- Basic Link ohne permanente DRC-Rechte

### V3-Ziel

- `POST /internal/emqx/authn`
- Credential Store
- trusted `client_attrs.gateway_sn`
- AuthZ ohne Identitätsableitung aus `clientid`
- persistentes Audit

## Interner Autorisierungsendpunkt

```http
POST http://control-api:8081/internal/emqx/authz
```

Port `8081` ist ein interner Infrastruktur-Port und darf nicht über den
öffentlichen Reverse Proxy erreichbar sein.

Der Endpunkt ist **kein DJI-Cloud-API-Endpunkt**.

## AuthZ-Anfrage

Der aktuelle Code verarbeitet unter anderem:

```json
{
  "clientid": "MQTT-SESSION-ID",
  "username": "dji-gateway-...",
  "peerhost": "10.0.0.20",
  "topic": "thing/product/AIRCRAFT_SN/osd",
  "action": "publish",
  "qos": "0"
}
```

Für V3 wird die Anfrage zusätzlich um vertrauenswürdige Client-Attribute aus
der vorgelagerten AuthN erweitert, insbesondere:

```text
client_attrs.role
client_attrs.gateway_sn
```

## Antworten

Ausgewertete Entscheidungen werden mit HTTP 200 zurückgegeben:

```json
{"result":"allow"}
```

```json
{"result":"deny"}
```

Für bewusst nachgelagerte statische Rollen:

```json
{"result":"ignore"}
```

Dynamische DJI-Fehler müssen fail-closed behandelt werden. Ein Backendfehler
darf keine breitere Datei-Regel aktivieren.

## Interne Service-Authentisierung

Der aktuelle AuthZ-Endpunkt kann mit:

```env
EMQX_AUTHZ_TOKEN=<zufälliges-internes-secret>
```

abgesichert werden.

Der Token authentifiziert **EMQX gegenüber der Control API**. Er ersetzt nicht
die MQTT-Client-Authentifizierung.

Ohne korrektes internes Secret bleiben dynamische Rechte gesperrt.

## Gateway-Prinzip

Die alte Annahme:

```text
clientid == gateway_sn
```

ist **nicht** mehr Teil der V3-Sicherheitsarchitektur.

V3 verwendet:

```text
Gateway-Credential
 -> HTTP AuthN
 -> trusted gateway_sn
 -> HTTP AuthZ
 -> TopologyRegistry
```

Die reale Client-ID wird weiterhin für Diagnose und Reconnect-Analyse
aufgezeichnet.

## Topologie-Regeln

Nach erfolgreicher Gateway-Authentifizierung darf ein Gateway nur Topics
verwenden, die zu seiner vertrauenswürdigen `gateway_sn` oder zu aktuell
zugeordneten Sub-Devices gehören.

Beispiele:

- eigenes `sys/product/{gateway_sn}/status`
- eigene Gateway-Uplinks
- Aircraft-`osd/state` nur für Geräte aus der aktuellen Topologie
- eigene Downstream-Subscriptions

Fremde Gateway- oder Aircraft-Topics werden verweigert.

## DRC

DRC gehört nicht zum dauerhaften Basic-Link-Authorizer.

V3 verlangt für DRC zusätzlich:

1. FC3
2. Control Lease
3. DJI Control Authority
4. aktive DRC-Sitzung
5. passende Produkt-Capability
6. Dead-Man

Der aktuelle Default bleibt broker- und anwendungsseitig gesperrt.

## Datei-ACL

Statische Rollen wie Backend und Diagnose dürfen weiterhin über die
Datei-ACL abgebildet werden.

Die Datei muss mit einem abschließenden Deny enden:

```erlang
{deny, all}.
```

Produktiv soll die Weboberfläche keine MQTT-Credentials besitzen.

## Cache

Dynamische Gateway-Rechte dürfen nur sehr kurz gecacht werden, weil
`update_topo`, Unpairing und Credential-Deaktivierung schnell wirksam werden
müssen.

Schreibende Services und Property-Set werden nicht über lang laufende
Autorisierungs-Caches freigegeben. DRC wird vollständig vom AuthZ-Cache
ausgeschlossen (`drc/down` und `drc/up`), damit Start, Entzug und Dead-Man-
Übergänge ohne TTL-Nachlauf wirksam werden. Für übrige dynamische Rechte gilt
eine kurze TTL von 1 s.

## Audit und Betrieb

Bei Deny-Entscheidungen mindestens erfassen:

- Principal/Username
- Client-ID
- vertrauenswürdige Gateway-SN
- Aktion
- Topic
- Peer-IP
- Grund

Secrets werden nicht geloggt.

Vor einer produktiven FC3-Freigabe müssen Authorizer-Latenz,
Fehlerverhalten, Cache-Verhalten und Fail-Closed-Verhalten unter Last getestet
werden.

## Weiterführend

Siehe:

- [DJI-MQTT-Sicherheitsvertrag](DJI_MQTT_SECURITY.md)
- [DRC](DRC.md)
- [RC Pro Enterprise](RC_PRO.md)
- [V3-Zielarchitektur](V3_ARCHITECTURE.md)


## Stabile Reason-Taxonomie

Jede Entscheidung des HTTP-Hooks besitzt genau einen Grund aus:

```text
no_match
gateway_own_topic
gateway_topology_mismatch
webui_read_only
webui_topic_out_of_scope
drc_session_active
drc_session_inactive
drc_backend_publish
internal_error
internal_token_mismatch
```

Die Priorität ist deterministisch:

1. interner Token-/Systemfehler
2. DRC-Session-Gate
3. WebUI read-only / Scope
4. Gateway-eigene bzw. Topologie-Regeln
5. no_match

Damit ist zum Beispiel ein DRC-Deny wegen fehlender Runtime-Sitzung immer
`drc_session_inactive` und nicht ein generisches `no_match`.

### Runtime ist Autoritätsquelle

Die persistierte PostgreSQL-Gateway-Registry ist **Inventar**, keine
Autorisierungsquelle. Der Authorizer liest ausschließlich die aktuelle
`DjiTopologyRegistry` der laufenden Prozessinstanz.

Dasselbe gilt für DRC: `isDrcGatewayActive()` liest ausschließlich den
`InMemoryDrcSessionStore` derselben Prozesslaufzeit. Nach einem Neustart
werden DRC-Rechte nicht aus PostgreSQL oder Mission-Persistenz rehydriert.

## Audit-Selektion

Alle `deny`- und `ignore`-Entscheidungen werden für das Audit vorgesehen.
`allow` wird nur für steuerungsrelevante Topics protokolliert:

```text
drc/up
drc/down
services
property/set
```

Normale erlaubte OSD-/State-Subscriptions und Telemetrie-Publishes sollen
später in gesampelte Betriebsmetriken statt in die Hot-Audit-Tabelle fließen.

## Latenz und Cache

Der HTTP-Hook misst seine eigene Policy-Laufzeit als `latency_us`.

Ein echter EMQX-Authorization-Cache-Hit erreicht den HTTP-Hook nicht. Deshalb
kann das Backend für eingegangene Hook-Aufrufe kein belastbares
`cache_hit=true` feststellen. Cache-Hit-Rate und Cache-Misses werden später
aus EMQX-Metriken übernommen und mit der Audit-/Statistikansicht korreliert,
statt einen erfundenen Backend-Wert zu speichern.


## AuditWriter

`AuthzAuditWriter` ist eine reine Senke und liegt **hinter** der Entscheidung:

```text
AuthZ Policy
  |-- HTTP 200 result sofort
  |
  +-- JSONL stdout
  |
  +-- Ringbuffer 10k
        |
        +-- 500 Zeilen oder 2 s
              |
              +-- TimescaleDB
```

Der Request-Hot-Path wartet nicht auf PostgreSQL. Bei SIGINT/SIGTERM wird der
Puffer vor dem Schließen des DB-Pools bestmöglich vollständig geflusht. Ist
TimescaleDB nicht erreichbar, verhindert der Writer keinen Shutdown; die
JSONL-Senke wurde bereits synchron angestoßen.

Der DRC-Auditkontext stammt ebenfalls ausschließlich aus Runtime-State.
`drc_session_id` wird beim Übergang nach `requesting` neu als UUID erzeugt
und nach einem Prozessneustart nicht aus Persistenz wiederhergestellt.


## `is_superuser`

`is_superuser` gehört zum **Authentication-Vertrag**, nicht zur Antwort des
HTTP-Authorization-Hooks. Der Authorizer antwortet ausschließlich mit
`result = allow | deny | ignore`.

FH-Clone erzeugt daher im Endpoint `/internal/emqx/authz` kein
`is_superuser`-Feld.
