# EMQX HTTP Authorization

## Ziel

FH-Clone verwendet den EMQX-HTTP-Authorizer für dynamische
RC-Pro↔Sub-Device-Rechte. Die Entscheidung wird pro MQTT Publish/Subscribe
gegen die aktuelle DJI-`update_topo`-Registry geprüft.

Endpoint:

```text
POST /internal/emqx/authz
```

Der Endpoint läuft auf dem internen Control-API-Port 8081.

## Request

EMQX sendet:

```json
{
  "clientid": "RC-PRO-SN",
  "username": "dji-gateway-rc-pro",
  "action": "publish",
  "topic": "thing/product/M3E-SN/osd",
  "qos": "0",
  "peerhost": "10.0.0.20"
}
```

## Response

FH-Clone antwortet immer mit HTTP 200 und einem der EMQX-Ergebnisse:

```json
{"result":"allow"}
```

```json
{"result":"deny"}
```

```json
{"result":"ignore"}
```

`ignore` wird nur für Identitäten verwendet, die nicht durch den
DJI-Gateway-HTTP-Authorizer behandelt werden sollen. Die EMQX-`precondition`
soll diese Requests normalerweise bereits überspringen.

## Fail-closed

Für den DJI-Gateway-Endpunkt gilt:

- fehlender Bearer-Token -> `deny`
- falscher Bearer-Token -> `deny`
- ungültiges JSON -> `deny`
- ungültiges Request-Schema -> `deny`
- DJI-Adapter/Topology nicht verfügbar -> `deny`
- interne Exception -> `deny`

Dabei wird absichtlich HTTP 200 verwendet. EMQX interpretiert andere
HTTP-Statuscodes als `ignore` und würde danach die nächste
Autorisierungsquelle prüfen.

Zusätzlich bleibt:

```hocon
authorization.no_match = deny
```

aktiv.

## Bearer-Token

Backend:

```env
EMQX_AUTHZ_TOKEN=<mindestens-32-zufällige-bytes>
```

EMQX-Konfigurations-Override:

```text
EMQX_AUTHORIZATION__SOURCES__1__HEADERS__AUTHORIZATION='"Bearer <derselbe-token>"'
```

Der Repository-Default ist absichtlich ungültig. Ohne Runtime-Secret kann der
HTTP-Authorizer keine Gateway-Aktion erlauben.

## Gateway-Regeln

Für `dji-gateway-*` gilt:

- MQTT-`clientid` muss ein sicher formatierter Gateway-Identifier sein
- eigenes `sys/product/{gateway_sn}/status` darf als Topology-Bootstrap
  publiziert werden
- eigene Gateway-Upstream-Topics sind erlaubt
- Sub-Device-`osd/state` nur, wenn die Registry
  `sub_device_sn -> gateway_sn` bestätigt
- Subscriptions ausschließlich auf eigene Downstream-/Control-Topics
- alles andere `deny`

## Cache

Aktuell:

```hocon
cache {
  enable = true
  max_size = 1024
  ttl = 5s
}
```

Die kurze TTL ist bewusst konservativ. Zusätzlich werden die steuerungsrelevanten
Topic-Filter vollständig vom Authorization-Cache ausgeschlossen:

```text
thing/product/+/services
thing/product/+/property/set
thing/product/+/drc/down
```

Damit werden FlyTo/Service-Kommandos, Property-Set und DRC-Downlink bei jeder
Operation neu autorisiert.

Bei einem `update_topo`-Wechsel können gecachte Telemetrieentscheidungen
(`osd/state`) weiterhin höchstens bis zum Ablauf der 5-Sekunden-TTL bestehen.
Vor produktiver DRC-Freigabe folgen zusätzlich:

1. gezielte Cache-Invalidierung unmittelbar nach relevanten Topology-Änderungen
2. Authz-Latenz und Cache-Hit-Rate messen
3. Failure-Test: Control API stoppen; DJI-Gateway muss blockiert bleiben

## Transport

Solange EMQX und Control API ausschließlich in einem privaten
Container-/Host-Netz kommunizieren, ist HTTP als interner Transport
vertretbar. Sobald dieser Pfad ein Host-/Trust-Boundary überschreitet, wird
HTTPS/mTLS verwendet.


## Gateway-Identität

Für den aktuellen Provisionierungsmodus ist Username und MQTT-`clientid`
explizit gekoppelt:

```text
clientid = RC-PRO-001
username = dji-gateway-RC-PRO-001
```

Die Autorisierung verweigert einen Request, wenn der Username nicht exakt
`dji-gateway-<clientid>` entspricht. Dadurch kann ein gültiger
`dji-gateway-*`-Account nicht einfach eine fremde Gateway-SN als Client-ID
verwenden.
