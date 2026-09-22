# FH-Clone Control API

Zentraler Backend-Prozess für:

- DJI Cloud MQTT-Ingest
- Device-/Parameter-Registry
- DJI Gateway↔Sub-Device-Topologie
- öffentliche Read-API
- interne EMQX-Autorisierung

## Ports

- `8080`: öffentliche FH-Clone API
- `8081`: interne API für Infrastruktur; **nicht ins Internet veröffentlichen**

## DJI

Wenn `DJI_MQTT_URL` gesetzt ist, startet der Prozess den DJI-Cloud-Adapter.

Umgebungsvariablen:

- `DJI_MQTT_URL`
- `DJI_MQTT_USERNAME`
- `DJI_MQTT_PASSWORD`
- `DJI_MQTT_CLIENT_ID`
- `DJI_CLOUD_API_VERSION`

## Topologie

`update_topo` auf `sys/product/{gateway_sn}/status` füllt die Gateway-Registry.

Für RC Pro Enterprise gilt damit:

```text
RC-Pro-SN (Gateway)
   └── Aircraft-SN (Sub-Device)
```

Standard-OSD/State kann unter der Aircraft-SN erscheinen. Service- und DRC-Pfade verwenden die Gateway-SN.

## EMQX

`POST /internal/emqx/authz` ist ausschließlich für den internen EMQX-Authorizer vorgesehen. Die Logik erlaubt einem provisionierten DJI-Gateway:

- das eigene `update_topo` als Bootstrap,
- eigene Gateway-Upstream-Topics,
- OSD/State eines Aircraft nur dann, wenn `update_topo` dieses Aircraft aktuell diesem Gateway zuordnet,
- nur eigene Downstream-Topics als Subscription.

Andere Rollen werden mit `ignore` an die nachfolgende Datei-ACL weitergegeben.


## EMQX-HTTP-Authorizer absichern

Der interne Authorizer verlangt einen Bearer-Token.

Control API:

```env
EMQX_AUTHZ_TOKEN=<starker-zufälliger-token>
```

EMQX erhält denselben Wert über den Konfigurations-Override:

```text
EMQX_AUTHORIZATION__SOURCES__1__HEADERS__AUTHORIZATION='"Bearer <starker-zufälliger-token>"'
```

Fehlt der Token oder ist er falsch, antwortet
`POST /internal/emqx/authz` immer mit HTTP 200 und:

```json
{"result":"deny"}
```

Dasselbe gilt für ungültige JSON-Payloads, unvollständige Requests und interne
Evaluierungsfehler. Damit wird ein Fehler nicht durch einen HTTP-Status ungleich
200 versehentlich zu EMQX-`ignore`.

Der interne Port 8081 bleibt ausschließlich im privaten Infrastruktur-Netz.
