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


## Implementierungsstatus des HTTP-Authorizers

`base.hocon` verweist bereits auf:

```text
POST http://control-api:8081/internal/emqx/authz
```

Der dazugehörige Control-Service-Endpunkt ist im aktuellen Repository noch
nicht implementiert. Die HTTP-Authorizer-Konfiguration darf deshalb nicht als
bereits produktionsbereit betrachtet werden.

Bis zur Implementierung bleibt die sichere Haltung: fehlende dynamische
Sub-Device-Freigabe führt zu **deny**, nicht zu einer globalen Wildcard.
