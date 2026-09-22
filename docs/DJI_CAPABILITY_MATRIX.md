# DJI Capability-Matrix für FH2 V3

## Zweck

Dieses Dokument ist die verbindliche Abbildung zwischen der offiziellen
DJI-Cloud-API-Produkt-/Funktionsdokumentation und den in FH2 V3 tatsächlich
freigegebenen Capabilities.

Grundregel:

```text
DJI dokumentiert Funktion
    !=
FH2 gibt Funktion automatisch frei
```

FH2 benötigt zusätzlich:

- eindeutige Produktidentität aus `domain + type + sub_type`
- passendes Gateway
- zur Laufzeit bekannte Topologie
- Capability-Profil
- Safety-Stufe
- Control Lease
- bei Cloud Control: DJI Control Authority
- bei DRC: aktive DRC-Sitzung und Dead-Man

## Verbindliche Produktidentität

DJI definiert ein Gerät über:

```text
domain + type + sub_type
```

FH2 darf daher nicht nur anhand von `type` entscheiden.

### Gateways

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| DJI RC Pro Enterprise | 2 | 144 | 0 |
| DJI RC Plus | 2 | 119 | 0 |
| DJI RC Plus 2 | 2 | 174 | 0 |

### Aircraft im aktuellen Pilot-to-Cloud-Profil

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| Mavic 3 Enterprise | 0 | 77 | 0 |
| Mavic 3 Thermal | 0 | 77 | 1 |
| Mavic 3TA | 0 | 77 | 3 |
| Matrice 4E | 0 | 99 | 0 |
| Matrice 4T | 0 | 99 | 1 |

Unbekannte Domains oder Subtypen werden **fail-closed** behandelt.

## Live-Control-Matrix

| Funktion | M3E/M3T/M3TA + RC Pro Enterprise | M4E/M4T + RC Plus 2 | FH2 V3 |
| --- | --- | --- | --- |
| Kamera-Steuerung | DJI dokumentiert | DJI dokumentiert | `control.camera` |
| Gimbal-Steuerung | DJI dokumentiert | DJI dokumentiert | `control.gimbal` |
| Payload-Steuerung | DJI dokumentiert | DJI dokumentiert | `payload.control` |
| Flugsteuerung / Stick | nicht für M3-Pilot-Cloud | DJI dokumentiert | M4: `control.flight` |
| Return-to-Home | nicht freigegeben | DJI dokumentiert `return_home` / `return_home_cancel` | M4: `control.rth` |
| FlyTo | nicht freigegeben | DJI dokumentiert | M4: internes `flyTo=true` |
| Pointing Flight | nicht freigegeben | DJI dokumentiert | M4: `control.pointing` |
| Orbit / POI | nicht freigegeben | DJI dokumentiert | M4: `control.orbit` |
| One-key Takeoff | nicht freigegeben | DJI dokumentiert | **nicht als V3-Capability exponiert** |
| Forced/Emergency Landing | nicht freigegeben | DJI dokumentiert | **nicht als V3-Capability exponiert** |
| Emergency Stop | nicht für M3-Flugsteuerung | DJI dokumentiert | nur interner Safety-/DRC-Pfad |

Die letzten drei Funktionen werden trotz DJI-Unterstützung im V3-Freeze nicht
als neue öffentliche Produktfunktion aufgenommen.

## Mavic 3 Enterprise Series

DJI beschreibt für den Pilot-to-Cloud-Live-Control-Pfad:

- Cloud-Steuerung der Payload
- Gimbal
- Zoom
- Infrarot-Funktionen bei geeigneter Kamera

DJI beschreibt **keine Cloud-Flugsteuerung** für die Mavic-3-Enterprise-Serie
in diesem Pfad. Die physische RC kann während der Cloud-Payload-Steuerung
weiterhin das Aircraft fliegen.

FH2 bildet daher ab:

```text
control.camera
control.gimbal
payload.control
```

Nicht vergeben:

```text
control.flight
control.rth
control.pointing
control.orbit
```

## Matrice 4 Series

DJI beschreibt hinter RC Plus 2:

- Cloud Flight Control
- Payload Control
- Stick Control
- FlyTo
- Pointing Flight
- Orbit/POI
- Return-to-Home
- weitere Live-Flight-Control-Kommandos

FH2 V3 vergibt für M4E/M4T:

```text
control.flight
control.rth
control.pointing
control.orbit
control.camera
control.gimbal
payload.control
```

Das aktiviert **nicht** automatisch FC3.

## M3M

M3M muss getrennt betrachtet werden.

Die aktuelle DJI-Cloud-API-Produktübersicht für den Pilot-to-Cloud-Pfad
enumeriert bei `type=77`:

```text
sub_type 0 = M3E
sub_type 1 = M3T
sub_type 3 = M3TA
```

M3M wird dort nicht als eigener Cloud-Runtime-Produkttyp enumeriert.

Gleichzeitig führt DJI M3M in anderen Verträgen, insbesondere:

- Mobile SDK V5
- WPML / Wayline
- Mapping-/Media-Kontext

Deshalb gilt in FH2:

```text
M3M WPML/Media/MSDK-Support
    !=
automatische Pilot-Cloud-Live-Control-Capability
```

Ohne eindeutige offizielle Cloud-Enumeration beziehungsweise real verifizierte
`update_topo`-Identität erhält M3M **kein** M3E/M3T-Live-Control-Profil.

## Kamera-Identitäten

Die im Adapter hinterlegten festen Payload-Identitäten stimmen mit der
aktuellen DJI-Produktübersicht überein:

| Kamera | payload_index |
| --- | --- |
| Mavic 3E | `66-0-0` |
| Mavic 3T | `67-0-0` |
| Mavic 3TA | `129-0-0` |
| Matrice 4E | `88-0-0` |
| Matrice 4T | `89-0-0` |

Diese Tabelle identifiziert ausschließlich das Payload. Lens-/Video-Pfade
werden weiterhin zur Laufzeit ermittelt.

## Safety-Zuordnung

FH2 V3:

| Capability | Safety |
| --- | --- |
| `control.camera` | nach zentraler Safety-Regel |
| `control.gimbal` | nach zentraler Safety-Regel |
| `payload.control` | nach zentraler Safety-Regel |
| `mission.wayline` | mindestens FC2 |
| `control.flight` | FC3 |
| `control.rth` | FC3 |
| `control.pointing` | FC3 |
| `control.orbit` | FC3 |

Produktunterstützung hebt die Safety-Stufe niemals automatisch an.

## Noch real zu verifizieren

Vor V3-RC bleiben Hardwaretests erforderlich für:

- reale `update_topo`-Payloads von RC Pro Enterprise
- reale `update_topo`-Payloads von RC Plus 2
- Firmwareabhängigkeiten
- RC-Pro-Client-ID und Reconnect
- Cloud-Control-Authority
- tatsächliche M3E/M3T/M3TA-Payload-Kommandos
- tatsächliche M4E/M4T-Live-Control-Sequenz

## Offizielle DJI-Referenzen

- Produktunterstützung und Enumerationen:
  https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- Pilot-to-Cloud Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/pilot-feature-set/drc.html
- RC Plus 2 Live Flight Controls:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/dji-rc-plus-2/drc.html
- RC Pro DRC/Payload:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/pilot-to-cloud/mqtt/rc-pro/drc.html
- WPML:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dji-wpml/template-kml.html
