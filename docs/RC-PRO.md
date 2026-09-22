# DJI RC Pro Enterprise

FH-Clone behandelt den DJI RC Pro Enterprise mit Pilot 2 als **Gateway**. Die
Aircraft-SN und die Gateway-SN bleiben getrennte Identitäten.

## Topic-Modell

DJI dokumentiert Property-Telemetrie mit der Geräte-SN:

```text
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
```

DRC und Service-Steuerung arbeiten dagegen mit der Gateway-SN:

```text
thing/product/{gateway_sn}/services
thing/product/{gateway_sn}/services_reply
thing/product/{gateway_sn}/drc/down
thing/product/{gateway_sn}/drc/up
```

Richtung:

```text
drc/down  Cloud -> RC Pro / Gerät
drc/up    RC Pro / Gerät -> Cloud
```

## update_topo

Die Gateway-/Sub-Device-Zuordnung wird aus `update_topo` gelernt.

FH-Clone akzeptiert read-only beide in der DJI-Dokumentation auftauchenden
Statuspfade:

```text
sys/product/{gateway_sn}/status
thing/product/{gateway_sn}/status
```

Der ACK bleibt auf dem dokumentierten allgemeinen Pfad:

```text
sys/product/{gateway_sn}/status_reply
```

Die Registry löst anschließend auf:

```text
device_sn -> gateway_sn
```

## Secret-Schutz

`update_topo` kann `device_secret` und `nonce` für Gateway und
Sub-Devices enthalten.

FH-Clone übernimmt diese Felder **nicht** in das öffentliche
`DjiGatewayTopology`-Modell. Zusätzlich wird die Raw-Message für
`onRawMessage` bei `update_topo` durch
`toPublicDjiTopologyPayload()` sanitisiert.

Damit gelangen diese Geheimnisse nicht versehentlich in später angeschlossene
WebSocket-/Logging-Pfade.

## EMQX

`infra/emqx/base.hocon` ist bereits für einen HTTP-Authorizer vorkonfiguriert:

```text
POST http://control-api:8081/internal/emqx/authz
```

Wichtig: Im aktuellen Repository ist dieser HTTP-Endpunkt noch **nicht als
Control-Service implementiert**. Die Konfiguration ist daher ein vorbereitetes
Security-Gate und noch kein produktionsfertiger dynamischer Authorizer.

Bis dieser Service existiert:

- keine pauschale `thing/product/+/#`-Freigabe für DJI-Gateways
- statische ACL bleibt Default-Deny
- Sub-Device-Telemetrie darf nicht durch eine breite Wildcard umgangen werden

Der spätere Authorizer muss die MQTT-`clientid` an die reale
`gateway_sn` binden und nur die durch `update_topo` bestätigten
`sub_device_sn` freigeben.

## DRC

Vor einem DRC-Befehl wird die Aircraft-SN über die TopologyRegistry zur
Gateway-SN aufgelöst:

```ts
const gatewaySn = adapter.resolveGatewaySn(aircraftSn);
```

Erst danach darf ein separater DRC-/Command-Service auf
`thing/product/{gatewaySn}/drc/down` publizieren.

Browser/WebUI erhalten keine direkte DRC-MQTT-Berechtigung.
