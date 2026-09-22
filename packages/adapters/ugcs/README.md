# UgCS-Groundstation-Adapter

## Aufgabe

Der TypeScript-Adapter kapselt UgCS als eigenständige Groundstation-
Integration.

UgCS ist kein DJI-Untermodul und ersetzt weder DJI Cloud API noch FlightHub 2.

## Domänengrenze

Der Adapter kann Groundstation-Funktionen in das gemeinsame FH2-Domainmodell
übersetzen, zum Beispiel:

- Fahrzeuge lesen
- Groundstation-Telemetrie einbinden
- Routen/Missionen importieren
- Routen/Missionen exportieren
- später kontrollierte Missionsübertragung

## Transport

FH-Clone erfindet keine nicht dokumentierten UgCS-Endpunkte.

Die TypeScript-Seite verwendet deshalb eine abstrahierte Transportgrenze.
Eine konkrete Transportimplementierung wird nur gegen eine verifizierte
UgCS-/UCS-Version aktiviert.

## Safety

Unter FC0 sind ausschließlich lesende und planerische Funktionen vorgesehen.

Schreibende Missionsfunktionen benötigen mindestens FC2 und den zentralen
Command-/Authority-Pfad.

Direkte Groundstation-Kommandos aus der Weboberfläche sind nicht vorgesehen.

## V3

Für V3 bleibt UgCS ein optionaler Adapterdienst. Der Hauptstack muss auch ohne
laufende UgCS-Bridge gesund starten können.
