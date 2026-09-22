# DJI RC Pro Enterprise – Gateway-Vertrag

## Zweck

Dieses Dokument beschreibt, wie FH-Clone die DJI RC Pro Enterprise im
Pilot-2-Cloud-Pfad behandelt.

Es trennt bewusst:

- dokumentierte DJI-Produktidentität
- aktuell implementiertes FH2-Modell
- Punkte, die vor V3 mit realer Hardware verifiziert werden müssen

## Rollenmodell

Im Pilot-2-Cloud-Pfad ist der Controller das Gateway; das Aircraft wird als
Sub-Device geführt.

```text
DJI RC Pro Enterprise
gateway_sn
   |
   +-- Mavic 3 Enterprise / Thermal / Multispectral
       device_sn
```

Die Zuordnung wird über `update_topo` gelernt.

Typischer Topic-Pfad:

```text
sys/product/{gateway_sn}/status
method = update_topo
```

## Produkt-IDs

Aktuell im FH2-Profil verwendete DJI-Produktwerte:

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| DJI RC Pro Enterprise | 2 | 144 | 0 |
| DJI RC Plus | 2 | 119 | 0 |
| DJI RC Plus 2 | 2 | 174 | 0 |
| Mavic 3 Enterprise (M3E) | 0 | 77 | 0 |
| Mavic 3 Thermal (M3T) | 0 | 77 | 1 |
| Mavic 3TA | 0 | 77 | 3 |
| Matrice 4E | 0 | 99 | 0 |
| Matrice 4T | 0 | 99 | 1 |

Produkt-IDs müssen gegen die verwendete DJI-Cloud-API-Dokumentation geprüft
werden, wenn neue Geräteprofile aufgenommen werden.

### M3M-Hinweis

Die aktuelle DJI-Cloud-API-Produktübersicht enumeriert in der
Mavic-3-Enterprise-Reihe explizit M3E, M3T und M3TA. Die aktuelle WPML-Doku
führt M3M gleichzeitig als unterstütztes Produkt.

FH2 leitet daraus **keinen** nicht explizit dokumentierten M3M-`sub_type`
ab. Für den Cloud-Runtime-Pfad gilt die reale `update_topo`-Meldung
beziehungsweise eine eindeutige DJI-Enumeration als authoritative Quelle.

Damit bleibt M3M fachlich für Media/WPML unterstützt, ohne eine unbestätigte
Cloud-Geräte-ID in den Core oder das Capability-Profil einzubauen.

## Gateway- und Aircraft-Topics

Aircraft-Telemetrie:

```text
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
```

Gateway-Services:

```text
thing/product/{gateway_sn}/services
thing/product/{gateway_sn}/services_reply
sys/product/{gateway_sn}/status
```

DRC ist davon getrennt und wird nur während einer zulässigen FC3-Sitzung
verwendet.

## Auflösung im Core

Vor einem gatewaybezogenen Service:

```text
Aircraft device_sn
 -> DjiTopologyRegistry
 -> gateway_sn
 -> Service-Topic
```

Dadurch bleibt die Aircraft-SN die Geräteidentität für Telemetrie, während der
Controller als Transport-Gateway separat modelliert wird.

## MQTT-Client-ID

Wichtig für V3:

```text
clientid != Security Identity
```

Die reale Pilot-2-Client-ID muss mit Hardware erfasst werden, wird aber nicht
als alleinige Quelle für `gateway_sn` verwendet.

V3-Ziel:

```text
Credential
 -> HTTP AuthN
 -> trusted gateway_sn
 -> AuthZ
```

## Mavic 3 Enterprise Series

Für M3E/M3T/M3M wird Cloud-Flugsteuerung nicht aus vorhandenen DRC-Topics oder
aus der Existenz von DRC-Code abgeleitet.

Das Capability-Profil entscheidet produktbezogen.

Der aktuelle FH2-Sicherheitsstand behandelt die Mavic-3-Enterprise-Familie im
Pilot-Cloud-Kontext als Payload-/Kamera-/Gimbal-orientiert; eine
`control.flight`-Capability wird nicht automatisch vergeben.

## Matrice 4 / RC Plus 2

Matrice 4 und RC Plus 2 besitzen ein anderes Produkt-/Control-Profil. Dafür
existiert bereits Code für Stick-Control und Cloud-Control-Authority.

Trotzdem gilt:

- Capability-Erkennung aktiviert FC3 nicht
- DRC bleibt sitzungsbasiert
- reale Hardwareverifikation ist vor V3-Freigabe erforderlich

## Reale V3-Prüfpunkte

RC-Pro-Agent #5 muss mindestens erfassen:

1. MQTT-Username
2. MQTT-Client-ID
3. Gateway-SN
4. Zeitpunkt, an dem Gateway-SN bekannt ist
5. erstes `update_topo`
6. Topic-Reihenfolge beim Start
7. Aircraft-`osd/state`
8. Reconnect nach Pilot-2-Neustart
9. Reconnect nach Controller-Neustart
10. Pair/Unpair
11. falsches Passwort
12. Broker nicht erreichbar
13. Session-Verhalten bei gleicher Client-ID
14. tatsächlich notwendige Publish-/Subscribe-Topics

## Firmware

Firmwarestände werden als Kompatibilitätsinformation dokumentiert, nicht als
hart codierte globale Mindestversion.

Aktuelle Herstellerstände gehören in
[COMPATIBILITY.md](COMPATIBILITY.md).

## Sicherheitsgrenze

Bis die Hardwaretests abgeschlossen sind:

```text
FC0
keine reale Aircraft-Control-Freigabe
keine permanente DRC-Brokerberechtigung
```
