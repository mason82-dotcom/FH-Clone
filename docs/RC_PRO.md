# DJI RC Pro Enterprise – Gateway-Vertrag

## Zweck

Dieses Dokument beschreibt, wie FH-Clone die DJI RC Pro Enterprise im
Pilot-2-Cloud-Pfad behandelt.

Es trennt bewusst:

- dokumentierte DJI-Produktidentität
- aktuell implementiertes FH2-Modell
- Punkte, die vor einer konkreten Pilot-to-Cloud-Hardware-Supportzusage mit
  realer Hardware verifiziert werden müssen

## Rollenmodell

Im Pilot-2-Cloud-Pfad ist der Controller das Gateway; das Aircraft wird als
Sub-Device geführt.

```text
DJI RC Pro Enterprise
gateway_sn
   |
   +-- M3E / M3T / M3M / M3TA aus Cloud-Topologie
   |
   +-- M3E / M3T / M3M / M3TA ergänzend aus der MSDK-Bridge
       device_sn
```

Für M3M wurde auf realer RC-Pro-Enterprise-/Pilot-2-Hardware ein
Cloud-`update_topo` mit `domain=0`, `type=77`, `sub_type=2` beobachtet.
Diese reale Cloud-Topologie ist für die Produktidentität authoritative.

Die MSDK-Subdevice-Beziehung bleibt als ergänzende read-only Inventarsicht
bestehen, wenn noch keine Cloud-Topologie vorliegt. Sie erzeugt weiterhin
keine Control-Freigabe.

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
| Mavic 3 Multispectral (M3M) | 0 | 77 | 2 |
| Mavic 3TA | 0 | 77 | 3 |
| Matrice 4E | 0 | 99 | 0 |
| Matrice 4T | 0 | 99 | 1 |

Produkt-IDs müssen gegen die verwendete DJI-Cloud-API-Dokumentation geprüft
werden, wenn neue Geräteprofile aufgenommen werden.

### M3M-Hinweis

Reale Pilot-2-/RC-Pro-Enterprise-Hardware hat M3M im DJI-Cloud-`update_topo`
als `domain=0`, `type=77`, `sub_type=2` gemeldet. FH2 führt diese
Kombination deshalb als bestätigte M3M-Produktidentität.

Diese Identitätsbestätigung ist ausdrücklich **keine** automatische
Pilot-to-Cloud-Control-Freigabe. M3M bleibt im Control-Profil fail-closed,
bis die tatsächlich unterstützten Payload-Kommandos und der zugehörige
Authority-/Reply-Pfad auf realer Hardware separat qualifiziert wurden.

Die MSDK-V5-Relation bleibt als ergänzende Inventarprovenienz erhalten, wenn
noch keine Cloud-Topologie vorliegt.

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

Verbindlich für V3:

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

Für M3E/M3T/M3TA wird Cloud-Flugsteuerung nicht aus vorhandenen DRC-Topics oder
aus der Existenz von DRC-Code abgeleitet.

M3M gehört nicht automatisch in dieses Pilot-to-Cloud-Live-Control-Profil.

Das Capability-Profil entscheidet produktbezogen.

FH2 aktiviert für M3E/M3T/M3TA hinter einer bestätigten RC Pro Enterprise
ausschließlich das von DJI dokumentierte Cloud-Payload-Control-Profil:

- `cloudControl = true`
- `flightControl = false`
- `stickControl = false`
- `droneControl = false`
- `payloadControl = true`
- `DjiDrcProfile = none`
- `flyTo = false`

Die DJI Cloud-Control-Authority bleibt für den Payload-Consent relevant.
FH2 leitet aus vorhandenen DRC-Topics ausdrücklich **keine**
Cloud-Flugsteuerungsfreigabe für M3E/M3T/M3TA ab.

## Matrice 4 / RC Plus 2

Matrice 4 und RC Plus 2 besitzen ein anderes Produkt-/Control-Profil. DJI
dokumentiert dort unter anderem Stick-Control und Cloud-Control-Authority.

Für FH2 gilt für M4 + RC Plus 2:

- `flightControl = true`
- `DjiDrcProfile = pilot-m4-stick`
- `stick_control` ist wieder aktiviert
- `drone_control` bleibt als separater DRC-Pfad aktiv
- beide Pfade bleiben FC3/Lease/Authority/Session/Dead-Man-gated
- FlyTo bleibt als separater Servicepfad unabhängig davon bewertbar

M3E/M3T/M3TA verwenden weder `stick_control` noch `drone_control` für
Cloud-Flugsteuerung. Der RC-Pro-Pfad bleibt auf Cloud-Payload-Control begrenzt.

## Reale Hardware-Prüfpunkte

Vor einer konkreten RC-Pro-/Pilot-to-Cloud-Hardware-Supportzusage ist
mindestens zu erfassen:

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

Für nicht real abgenommene Pilot-to-Cloud-Profile gilt weiterhin:

```text
FC0 als Software-Default
keine reale Aircraft-Control-Freigabe ohne passendes Hardwareprofil
keine permanente DRC-Brokerberechtigung
```

Die separat abgeschlossene MSDK-V5-Abnahme mit RC Pro Enterprise + M3E
ersetzt diese noch offenen MQTT-/Pilot-to-Cloud-Prüfpunkte nicht.
