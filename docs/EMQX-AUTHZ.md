# EMQX HTTP Authorization

## Zweck

`POST /internal/emqx/authz` ist eine interne FH-Clone-Schnittstelle für den
EMQX HTTP Authorizer. Sie ist **kein DJI Cloud API Endpunkt**.

Der Hook ergänzt die statische File-ACL um dynamische Entscheidungen, die von
Runtime-Zustand abhängen:

- Gateway ↔ Sub-Device-Topologie aus `update_topo`
- DRC-Freigaben
- spätere Mandanten-/Projektzuordnung
- Auditierbare Allow/Deny-Entscheidungen

## EMQX 5.7

FH-Clone bleibt aktuell auf EMQX 5.7.

Wichtig: Authorizer-`precondition` ist in dieser Zielversion nicht verfügbar.
Darum wird der HTTP-Authorizer für alle Publish-/Subscribe-Prüfungen aufgerufen.
Für Identitäten, die ausschließlich durch die File-ACL behandelt werden, liefert
das Backend `ignore`.

Reihenfolge:

```text
HTTP Authorizer
   |
   | allow/deny -> Entscheidung beendet
   |
   +-- ignore --> File ACL
                    |
                    +-- no match --> DENY
```

`authorization.no_match = deny` bleibt verbindlich.

## Endpoint

```text
POST http://control-api:8081/internal/emqx/authz
```

Port 8081 ist ein interner Service-Port und darf nicht öffentlich exponiert
werden.

## Request

```json
{
  "clientid": "RC-PLUS2-001",
  "username": "dji-gateway-RC-PLUS2-001",
  "peerhost": "10.0.0.20",
  "topic": "thing/product/M4T-001/osd",
  "action": "publish",
  "qos": "0"
}
```

## Response

FH-Clone antwortet für ausgewertete Authz-Anfragen mit HTTP 200:

```json
{"result":"allow"}
```

oder

```json
{"result":"deny"}
```

oder für eine bewusst nachgelagerte File-ACL:

```json
{"result":"ignore"}
```

EMQX behandelt HTTP 204 ebenfalls als Allow. Andere HTTP-Statuscodes werden
als `ignore` gewertet. Deshalb verwendet der interne Hook bei eigenen
Evaluierungsfehlern für dynamische Regeln absichtlich HTTP 200 + `deny`.

## Interner Bearer-Token

Dynamische DJI-/DRC-Entscheidungen sind zusätzlich durch einen internen Token
geschützt:

```env
EMQX_AUTHZ_TOKEN=<random-secret>
```

Die EMQX-Konfiguration enthält im Repository nur:

```text
Bearer __FH_CLONE_AUTHZ_DISABLED__
```

Ohne Runtime-Secret bleiben dynamische Gateway-/DRC-Rechte gesperrt.

Der Token authentifiziert **EMQX gegenüber control-api**. Er ersetzt nicht die
MQTT-Client-Authentifizierung.

## Gateway-Regeln

Für provisionierte DJI-Gateways gilt:

```text
username = dji-gateway-<clientid>
clientid = echte gateway_sn
```

Erlaubt werden dynamisch:

- eigenes Topology-Status-Publish
- eigene Gateway-Upstream-Topics
- Aircraft `osd/state` nur für Sub-Devices aus der aktuellen Topology-Registry
- eigene Downstream-Subscriptions

Fremde Gateway-/Aircraft-Topics werden verweigert.

## DRC

DRC ist **nicht** an eine bloße aktive Mission gekoppelt.

Eine dynamische DRC-Freigabe muss später mindestens repräsentieren:

1. Safety Stage FC3
2. aktiven FH-Clone Control Lease
3. gültige DJI Cloud-Control-Authority
4. aktive DRC-Session
5. passenden Geräte-/DRC-Capability-Pfad

Erst dann darf die Policy `isDrcGatewayActive(gatewaySn)` wahr liefern.

Aktuell ist dieser Callback im Control API absichtlich auf `false` verdrahtet.
Damit bleibt DRC brokerseitig fail-closed.

### Topic-Richtung

```text
backend/cloud -> thing/product/{gateway_sn}/drc/down
gateway/pilot -> thing/product/{gateway_sn}/drc/up
```

Die WebUI bekommt keine direkten MQTT-Schreibrechte.

## File-ACL

Rollen wie `webui-operator`, `backend-service` und `dashboard` werden für
ihre statischen Rechte weiterhin durch `acl.conf` behandelt.

`webui-operator` ist read-only und darf niemals direkt DRC oder Services
publizieren.

## Cache

FH-Clone nutzt aktuell:

```hocon
cache {
  enable = true
  max_size = 1024
  ttl = 1s
  excludes = [
    "thing/product/+/services",
    "thing/product/+/property/set"
  ]
}
```

Die kurze TTL reduziert HTTP-Last, ohne dynamische Rechte zehn Sekunden lang
weiterwirken zu lassen. Services/Property-Set werden in Echtzeit autorisiert.

DRC bleibt zusätzlich durch den serverseitigen Session-/Dead-man-Pfad
geschützt. Broker-Authz ist Defense-in-Depth und **nicht** der einzige
Flugsicherheitsmechanismus.

## Betrieb

- Deny-Entscheidungen werden mit Username, Client-ID, Action, Topic und
  optional Peer-IP protokolliert.
- Secrets werden nicht geloggt.
- Bei Überschreiten einer Trust Boundary ist HTTP durch HTTPS/mTLS zu ersetzen.
- Authorizer-Latenz und Cache-Hit-Rate müssen vor produktiver FC3-Freigabe
  gemessen werden.

## Quellen

- EMQX HTTP Authorization:
  https://docs.emqx.com/en/emqx/latest/access-control/authz/http.html
- EMQX Authorization:
  https://docs.emqx.com/en/emqx/latest/access-control/authz/authz.html
- EMQX File Authorization:
  https://docs.emqx.com/en/emqx/latest/access-control/authz/file.html
