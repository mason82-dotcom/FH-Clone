# DJI RC Pro Enterprise als Cloud-API-Gateway

## Rollenmodell

Bei DJI Pilot 2 ist die RC Pro Enterprise das **Gateway**. Das Aircraft ist ein **Sub-Device**.

```text
RC Pro Enterprise
gateway_sn
   |
   +-- Mavic 3 Enterprise Series
       device_sn
```

Die Zuordnung wird aus:

```text
sys/product/{gateway_sn}/status
method = update_topo
```

gelernt.

## Produkt-IDs

Aktuell dokumentierte relevante DJI-Enums:

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| DJI RC Pro Enterprise | 2 | 144 | 0 |
| DJI RC Plus | 2 | 119 | 0 |
| DJI RC Plus 2 | 2 | 174 | 0 |
| Mavic 3 Enterprise Series, M3E | 0 | 77 | 0 |
| Mavic 3 Enterprise Series, M3T | 0 | 77 | 1 |
| Mavic 3 Enterprise Series, M3TA | 0 | 77 | 3 |

Typ 119 darf daher nicht als RC Pro Enterprise interpretiert werden.

## Topic-Identität

Die Cloud API unterscheidet `gateway_sn` und `device_sn`.

### Device Properties

```text
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
```

Aircraft-Telemetrie kann deshalb unter der Aircraft-SN liegen.

### Gateway Services / DRC

```text
thing/product/{gateway_sn}/services
thing/product/{gateway_sn}/services_reply
thing/product/{gateway_sn}/drc/down   Cloud -> RC Pro
thing/product/{gateway_sn}/drc/up     RC Pro -> Cloud
sys/product/{gateway_sn}/status
```

FH-Clone hält beide Identitäten getrennt und löst vor einem Command:

```text
Aircraft-SN -> TopologyRegistry -> RC-Pro-SN
```

auf.

## Mavic 3 Enterprise Cloud-Control

Die aktuelle DJI Pilot-Cloud-Dokumentation unterscheidet zwischen Payload- und Flugsteuerung.

Für **Mavic 3 Enterprise Series** wird aktuell nur Cloud-Payload-Control dokumentiert. Die Fernsteuerung kann das Aircraft weiterhin mit den physischen Sticks fliegen.

Daher setzt FH-Clone für type 77:

- `control.camera`: ja
- `control.gimbal`: ja
- `payload.control`: ja
- `control.flight`: nein
- FlyTo über Pilot Cloud: nein

Der generische DRC-Code bleibt für Plattformen erhalten, für die DJI Cloud-Flugsteuerung explizit freigibt.

## Firmware-Hinweis

Die Werte RC Pro Enterprise `02.00.04.07`, M3E/M3T `06.01.06.06` und Pilot 2 `6.1.2.2` sind historisch dokumentierte Mindeststände aus älteren Cloud-API-Releases. Sie dürfen nicht als aktuelle empfohlene Firmware-Versionen dargestellt werden.

FH-Clone behandelt Firmware deshalb als Capability-/Compatibility-Information und nicht als hart codierte globale Mindestversion.
