# Kompatibilität

## Stand

Verifiziert am **22. September 2026** gegen die jeweils offiziellen
DJI-Developer-Unterlagen.

Diese Datei unterscheidet SDK-Version, Produktunterstützung und tatsächlich in
FH-Clone aktivierte Capability. Eine neue SDK-Version aktiviert keine Funktion
automatisch.

## DJI Cloud API

**Verifizierte Release-Baseline: 1.16.1**

| Version | Veröffentlichung | Relevanz |
| --- | --- | --- |
| 1.15 | 2025-06-10 | Dock 3: unter anderem PSDK-Firmware-Upgrade; Pilot-Cloud: Matrice 400 und MOP |
| 1.16 | 2025-11-26 | Dock 3: AI-Zielerkennung/-verfolgung |
| 1.16.1 | 2025-12-17 | Dock 3: unter anderem `remaining_power_for_return_home` und DLT-664-Thermalformat |

Wichtig: Die allgemeine DJI-Developer-Startseite kann einen älteren
Cloud-API-Stand anzeigen. Für FH-Clone ist die konkrete Cloud-API-Release-
History maßgeblich.

Die Cloud-API-Version ist in FH-Clone ein Kompatibilitätsprofil. MQTT selbst
verhandelt diese Version nicht.

Die offiziellen DJI-Cloud-API-Demos werden seit dem 10. April 2025 nicht mehr
gewartet. Sie dienen nur als Protokollreferenz und werden nicht als
Produktionsbasis übernommen.

## Android Mobile SDK V5

**Aktuell verifizierter Release: 5.18.0 vom 22. Mai 2026**

Die offizielle DJI-Liste nennt für 5.18.0 unter anderem Unterstützung für:

- DJI Mavic 3 Enterprise Series + RC Pro Enterprise
- DJI Mavic 3M + RC Pro Enterprise
- Mavic 3TA + RC Pro Enterprise
- Matrice 4E/4T + RC Plus 2
- Matrice 400 + RC Plus 2

Ein späterer FH2-MSDK-Adapter muss seine Capability weiterhin pro Gerät und
SDK-Laufzeit melden.

## Payload SDK

**Aktuell verifizierter Release: 3.16.0 vom 31. März 2026**

Die DJI-Unterlagen unterscheiden empfohlene Versionen je Produktfamilie.

Beispiele laut offizieller Supporttabelle:

- Matrice 4T/4E und neuere Plattformen: aktuelle PSDK-Version
- Mavic 3TA: PSDK 3.13.1
- Mavic 3 Enterprise Series: PSDK 3.9.2

FH-Clone darf daher nicht global `PSDK 3.16.0` als Mindestversion für alle
Produkte behandeln.

## Edge SDK V2

**Verifizierter Release: Edge SDK V2.0.0 vom 16. Juni 2026**

Der V2.0.0-Release ist für die DJI O4 Ground Station dokumentiert und
ermöglicht unter anderem MQTT-basierte Anbindung externer Geräte sowie
RID-/ADS-B-Datenweitergabe.

Diese Funktion ist kein Ersatz für DJI Cloud API oder MSDK und wird nicht auf
M3E/M3T/M3M übertragen.

## Produktbezogene Regeln

### Mavic 3 Enterprise / M3T / M3TA

- Pilot-to-Cloud über RC Pro Enterprise
- Produktidentität nur bei `domain=0,type=77,sub_type=0/1/3`
- Cloud-Live-Control im M3-Profil nur für Payload/Kamera/Gimbal
- keine Cloud-`control.flight`-, RTH-, Pointing- oder Orbit-Capability
- RTK/NTRIP-Grenze gemäß [RTK_NTRIP.md](RTK_NTRIP.md)

### M3M

- in MSDK/WPML-/Mapping-Kontexten dokumentiert
- in der aktuellen Pilot-to-Cloud-Produktmatrix nicht als eigener
  Cloud-Runtime-Produkttyp enumeriert
- erhält daher **kein** automatisch abgeleitetes M3E/M3T-Live-Control-Profil
- eine spätere Cloud-Capability benötigt eindeutige DJI-Enumeration oder
  reale, bestätigte `update_topo`-Identität

### Matrice 4D/4TD + DJI Dock 3

- Dock-to-Cloud über DJI Dock 3
- Dock 3: `domain=3,type=3,sub_type=0`
- M4D: `domain=0,type=100,sub_type=0`
- M4TD: `domain=0,type=100,sub_type=1`
- Kamera-Payloads: M4D `98-0-0`, M4TD `99-0-0`
- FH2 integriert den aktuellen Property-Vertrag read-only
- Cloud API 1.16.1 nennt für ihre neuen Dock-3-Funktionen mindestens
  Firmware `14.03.00.03` für M4D/4TD und Dock 3
- keine automatische Freigabe von Property-Write oder Dock-DRC

Details: [M4D_DOCK3.md](M4D_DOCK3.md)

### Matrice 4E/4T

- RC Plus 2 als relevantes Gatewayprofil
- Produktidentität nur bei `domain=0,type=99,sub_type=0/1`
- DJI dokumentiert Flight/Payload Control, FlyTo, Pointing, Orbit/POI und RTH
- FH2 exponiert daraus nur die im V3-Capability-Vertrag freigegebenen Funktionen
- FC3 wird niemals automatisch aus Produktunterstützung aktiviert

Details: [DJI_CAPABILITY_MATRIX.md](DJI_CAPABILITY_MATRIX.md)

## Firmware

Firmwarestände werden nicht als globale harte Konstante in den Core
eingebaut.

Für reale V3-Hardwaretests ist jeweils der aktuelle Herstellerstand des
konkreten Produkts zu prüfen.

## Offizielle Quellen

- Cloud API Release-History:
  https://developer.dji.com/doc/cloud-api-tutorial/cn/
- Cloud API Produktunterstützung:
  https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- Mobile SDK V5:
  https://developer.dji.com/doc/mobile-sdk-tutorial/en/
- Payload SDK:
  https://developer.dji.com/doc/payload-sdk-tutorial/en/
- Edge SDK V2:
  https://developer.dji.com/doc/edge-sdk-iot-tutorial/en/
