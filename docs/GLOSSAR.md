# Glossar

## Aircraft

Das eigentliche Fluggerät, zum Beispiel M3E, M3T, M3M oder Matrice 4.

## Adapter

Abgrenzungsschicht zwischen einem externen SDK/Protokoll und dem
SDK-neutralen Aircraft Core.

## AuthN

Authentifizierung: Prüfung, **wer** sich verbindet.

V3 soll Gateway-Credentials serverseitig an eine vertrauenswürdige
`gateway_sn` binden.

## AuthZ

Autorisierung: Prüfung, **was** ein authentifizierter Principal tun darf.

## Basic Link

Dauerhafte DJI-Cloud-MQTT-Verbindung für Status, Telemetrie, Events, Services
und Antworten.

Basic Link ist nicht DRC.

## Capability

Zur Laufzeit gemeldete Fähigkeit eines Geräts oder Adapters, zum Beispiel
`telemetry.rtk` oder `control.camera`.

Eine Capability ist noch keine Safety-Freigabe.

## Control Authority

FH2-interne Steuerhoheit. Sie legt fest, welcher Besitzer beziehungsweise
Adapter ein Gerät schreibend steuern darf.

## Control Lease

Zeitlich begrenzte FH2-Berechtigung zur Steuerung eines konkreten Geräts.

## DJI Control Authority

DJI-seitige Freigabe für bestimmte Cloud-Control-Funktionen.

Sie ersetzt nicht den FH2-Control-Lease.

## DRC

Direct Remote Control. Separate, sitzungsbasierte DJI-Steuerdomäne.

DRC wird in FH2 nur unter FC3 betrachtet.

## Dead-Man

Lokaler Sicherheitsmechanismus, der eine aktive Steuerung beendet oder in
einen sicheren Zustand überführt, wenn Bedienaktivität ausbleibt.

## device_sn

Seriennummer beziehungsweise Geräteidentität des Aircraft oder Sub-Devices.

## EMQX

MQTT-Broker des FH2-V3-Zielsystems.

## FC0 bis FC3

FH2-Sicherheitsstufen:

- FC0: Lesen, Analyse und Planung
- FC1: kontrollierte nicht flugkritische Schreibzugriffe
- FC2: Mission/Task
- FC3: Flugsteuerung, RTH und DRC

## Gateway

Controller oder DJI-Gerät, über das untergeordnete Geräte an die Cloud
angebunden sind.

## gateway_sn

Vertrauenswürdige Seriennummer/Identität des DJI-Gateways.

Sie darf in V3 nicht aus einer frei wählbaren MQTT-Client-ID abgeleitet
werden.

## MQTT clientid

MQTT-Sitzungskennung.

In FH2 ist sie Diagnose- und Sessioninformation, keine Sicherheitsidentität.

## Multispektral

Aufnahmen mit mehreren definierten Spektralbändern, zum Beispiel Green, Red,
Red Edge und NIR.

## NDVI

Normalized Difference Vegetation Index.

FH2 darf einen Datensatz nur als NDVI-bereit behandeln, wenn Red und NIR
eindeutig und vertrauenswürdig identifiziert sind.

## NIR

Nahinfrarot-Band.

## NTRIP

Protokoll zur Übertragung von GNSS-/RTK-Korrekturdaten.

Für M3E/M3T/M3M speichert FH2 keine NTRIP-Secrets.

## OSD

DJI-Topic-/Payload-Bereich für laufende Gerätelemetrie.

## Principal

Serverseitig bekannte und authentifizierte Identität.

## RTK

Real Time Kinematic. Verfahren zur präziseren GNSS-Positionsbestimmung mit
Korrekturdaten.

## Rohmeldung

Unveränderte Nachricht eines Adapters inklusive Originalpayload.

## SafetyGate

Zentrale FH2-Entscheidungsschicht, die Commands entsprechend FC0 bis FC3
freigibt oder blockiert.

## SSE

Server-Sent Events. HTTP-basierter Einweg-Livestream vom Backend zum Browser.

FH2 nutzt SSE aktuell für RTK-Liveereignisse.

## Sub-Device

Gerät, das hinter einem DJI-Gateway gemeldet wird, zum Beispiel ein Aircraft
hinter der RC Pro Enterprise.

## TopologyRegistry

Laufzeit-Registry für die Zuordnung:

```text
gateway_sn -> device_sn
```

## UgCS / UCS

UgCS ist die Groundstation. UCS steht für Universal Control Server und ist der
von der Java-Bridge verwendete Integrationspfad.

## update_topo

DJI-Statusmethode, mit der ein Gateway seine aktuelle
Gateway-/Sub-Device-Topologie meldet.
