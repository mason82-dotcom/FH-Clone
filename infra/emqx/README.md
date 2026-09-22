# EMQX für FH-Clone

## Warum dynamische DJI-Autorisierung?

Bei DJI Pilot 2 ist die Fernsteuerung das Gateway, das Aircraft ist ein Sub-Device.

Die Cloud-API trennt dabei Topic-Identitäten:

- `sys/product/{gateway_sn}/status` – Gateway-Topologie
- `thing/product/{device_sn}/osd` – Eigenschaften des jeweiligen Geräts, z. B. Aircraft
- `thing/product/{device_sn}/state` – Zustandsänderungen des jeweiligen Geräts
- `thing/product/{gateway_sn}/services` – Cloud → Gateway
- `thing/product/{gateway_sn}/drc/down` – Cloud → Gateway, DRC
- `thing/product/{gateway_sn}/drc/up` – Gateway → Cloud, DRC-Rückkanal

Eine reine Datei-Regel wie `thing/product/${clientid}/#` reicht deshalb nicht: Sie würde Aircraft-OSD unter der Aircraft-SN blockieren. Eine pauschale Freigabe `thing/product/+/osd` für jedes Gateway wäre dagegen zu breit.

FH-Clone verwendet deshalb zwei Authorizer:

1. **HTTP-Authorizer** für `dji-gateway-*`
2. **File-Authorizer** für Backend, optionale WebUI-Diagnose und Dashboard

Am Ende gilt immer Default-Deny.

## Dynamische Gateway-Prüfung

EMQX ruft intern auf:

```text
POST http://control-api:8081/internal/emqx/authz
```

Der Control-Service prüft die durch `update_topo` gelernte Zuordnung:

```text
RC-Pro-SN
  └── Aircraft-SN
```

Erlaubt wird unter anderem:

- Gateway publiziert eigenes `sys/product/{gateway_sn}/status` als Bootstrap
- Gateway publiziert eigene Gateway-Upstream-Topics
- Gateway publiziert Aircraft `osd/state` nur für aktuell zugeordnete Sub-Devices
- Gateway subscribed ausschließlich seine eigenen Downstream-/Control-Topics

Bei Ausfall oder fehlender Topologie fällt keine breite Freigabe zurück; die statische ACL endet mit Deny.

## Rollen

### `webui-operator`

Read-only. Produktiv sollte die React-WebUI bevorzugt keine MQTT-Credentials erhalten und über FH-Clone API/WebSocket arbeiten.

### `backend-service`

Der einzige allgemeine Cloud-Control-Publisher. DRC/Services werden zusätzlich in der Anwendung durch `ControlAuthority` und `CommandCoordinator` geschützt.

### `dji-gateway-*`

Wird dynamisch gegen Gateway-SN und `update_topo` geprüft. Die MQTT-Client-ID muss die echte Gateway-SN sein.

### `dashboard`

Read-only auf MQTT-/Systemdiagnose.

## Konfiguration

Die Authorizer-Reihenfolge in `base.hocon` ist sicherheitsrelevant:

```text
DJI HTTP topology authz
        ↓ ignore
static role ACL
        ↓ no match
      DENY
```

`authorization.no_match = deny` bleibt explizit gesetzt. Die statische Datei endet zusätzlich mit:

```erlang
{deny, all}.
```

## Interner Port

Der Control-Service-Port `8081` ist nur für EMQX bestimmt und darf nicht über den öffentlichen Reverse Proxy veröffentlicht werden.


## Bearer-Token zwischen EMQX und Control API

Der HTTP-Authorizer ist zusätzlich durch ein gemeinsames Secret geschützt.

Control API:

```env
EMQX_AUTHZ_TOKEN=<zufälliger-langer-token>
```

EMQX:

```text
EMQX_AUTHORIZATION__SOURCES__1__HEADERS__AUTHORIZATION='"Bearer <derselbe-token>"'
```

`base.hocon` enthält absichtlich nur den nicht nutzbaren Default
`Bearer __FH_CLONE_AUTHZ_DISABLED__`. Secrets werden nicht ins Repository
geschrieben.

Bei fehlendem/falschem Token antwortet die Control API mit HTTP 200 +
`{"result":"deny"}`. Auch Parser- und Evaluierungsfehler werden so beantwortet.

Das ist wichtig, weil EMQX HTTP-Statuscodes außer 200 und 204 als
`ignore` behandelt. Der Endpoint verlässt sich deshalb nicht auf 4xx/5xx, um
eine Aktion zu sperren.

## Cache-Strategie

Der Client-Authorization-Cache ist explizit aktiviert:

```hocon
cache {
  enable = true
  max_size = 1024
  ttl = 5s
}
```

Die kurze TTL begrenzt die Zeit, in der eine geänderte
Gateway↔Sub-Device-Zuordnung noch aus dem Session-Cache beantwortet werden kann.

Vor einer produktiven DRC-Freigabe wird separat entschieden, ob Control-Topics
wie `thing/product/+/drc/down` und `thing/product/+/services` vom Cache
ausgenommen werden. Diese Ausnahme wird erst aktiviert, wenn sie mit der
eingesetzten EMQX-Version verifiziert ist.

## Authorizer-Reihenfolge

Der HTTP-Authorizer bleibt **vor** der File-ACL, weil die statische ACL
`dji-gateway-*` am Ende ausdrücklich sperrt. Würde die Datei zuerst
ausgewertet, könnte die dynamische Gateway/Sub-Device-Prüfung nie erreicht
werden.

Ablauf:

```text
dji-gateway-* -> HTTP topology authz -> allow/deny
andere Rollen -> HTTP precondition übersprungen -> File ACL
kein Treffer -> no_match = deny
```
